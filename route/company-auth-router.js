'use strict';

const {Router} = require('express');
const jsonParser = require('express').json();
const httpErrors = require('http-errors');
const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
const Company = require('../model/company');
const Volunteer = require('../model/volunteer');
const logger = require('../lib/logger');
const basicAuthCompany = require('../lib/basic-auth-middleware')(Company);
const bearerAuthCompany = require('../lib/bearer-auth-middleware')(Company);

const companyAuthRouter = module.exports = new Router();

companyAuthRouter.post('/company/signup', jsonParser, (request, response, next) => {

  let filter = /^.+\@.+\.+.+$/; //eslint-disable-line

  if(!request.body.companyName || !request.body.password || !request.body.email || !request.body.phoneNumber || !request.body.website)
    return next(new httpErrors(400, '__ERROR__ <companyName>, <email>, <phoneNumber>, <website> and <password> are required to sign up.'));

  if(!filter.test(request.body.email))
    return next(new httpErrors(400, '__ERROR__ valid email required'));

  return Company.create(request.body.companyName, request.body.password, request.body.email, request.body.phoneNumber, request.body.website)
    .then(company => company.createToken())
    .then(token => response.json({token}))
    .catch(next);
});

companyAuthRouter.get('/company/login', basicAuthCompany, (request, response, next) => {
  return request.company.createToken()
    .then(token => response.json({token}))
    .catch(next);
});

companyAuthRouter.get('/company/pending', bearerAuthCompany, (request, response, next) => {
  return Company.findById(request.company._id)
    .populate('pendingVolunteers')
    .then(company => response.json({pendingVolunteers: company.getCensoredVolunteers().pendingVolunteers}))
    .catch(next);
});

companyAuthRouter.get('/company/active', bearerAuthCompany, (request, response, next) => {
  return Company.findById(request.company._id)
    .populate('activeVolunteers')
    .then(company => response.json({activeVolunteers: company.getCensoredVolunteers().activeVolunteers}))
    .catch(next);
});

companyAuthRouter.put('/company/update', bearerAuthCompany, jsonParser, (request, response, next) => {
  if(!(request.body.companyName || request.body.password || request.body.email || request.body.phoneNumber || request.body.website))
    return next(new httpErrors(400, '__ERROR__ <companyName>, <email>, <phoneNumber>, <website> or <password> are required to update company info'));

  let data = {};
  for(let prop of Object.keys(request.body)){
    if(request.company[prop])
      request.company[prop] = request.body[prop];
  }

  return request.company.save()
    .then(company => request.body.password ? request.company.changePassword(request.body.password) : company)
    .then(company => {
      data.companyName = company.companyName;
      data.email = company.email;
      data.phoneNumber = company.phoneNumber;
      data.website = company.website;

      return request.body.companyName || request.body.password ? company.createToken() : null;
    })
    .then(token => {
      if(token)
        data.token = token;
      return response.json(data);
    })
    .catch(next);
});

companyAuthRouter.put('/company/approve', bearerAuthCompany, jsonParser, (request, response, next) => {
  let data = {};
  if(!request.company.pendingVolunteers.map(volunteerId => volunteerId.toString()).includes(request.body.volunteerId))
    return next(new httpErrors(404, '__ERROR__ volunteer does not exist in pending volunteers'));
  return Volunteer.findById(request.body.volunteerId)
    .then(volunteer => {
      if(!volunteer)
        throw new httpErrors(404, '__ERROR__ volunteer not found');
      request.body.volunteerFirstName = volunteer.firstName;
      volunteer.activeCompanies.push(request.company._id);
      volunteer.pendingCompanies = volunteer.pendingCompanies.filter(companyId => companyId.toString() !== request.company._id.toString());
      return volunteer.save();
    })
    .then(volunteer => {
      request.volunteerPhoneNumber = volunteer.phoneNumber;
      request.company.activeVolunteers.push(volunteer._id);
      request.company.pendingVolunteers = request.company.pendingVolunteers.filter(volunteerId => volunteerId.toString() !== volunteer._id.toString());
      return request.company.save();
    })
    .then(company => {
      request.companyId = company._id;
      return client.messages.create({
        to: request.volunteerPhoneNumber,
        from: process.env.TWILIO_PHONE_NUMBER,
        body: `Congratulations ${request.body.volunteerFirstName}, you've been accepted as a volunteer by ${company.companyName}!`,
      });
    })
    .then(message => {
      logger.info(`${message.sid}: message sent to ${request.volunteerPhoneNumber}`);
      data.sid = message.sid;
      return Company.findById(request.companyId)
        .populate('pendingVolunteers')
        .populate('activeVolunteers');
    })
    .then(company => {
      data = {
        sid : data.sid,
        ...company.getCensoredVolunteers(),
      };
      return response.json(data);
    })
    .catch(next);
});

companyAuthRouter.put('/company/terminate', bearerAuthCompany, jsonParser, (request, response, next) => {
  if(!request.body.volunteerId)
    return next(new httpErrors(400, '__ERROR__ volunteer id is required'));

  return Volunteer.findById(request.body.volunteerId)
    .then(volunteer => {
      if(!volunteer)
        throw new httpErrors(404, '__ERROR__ volunteer not found.');

      volunteer.activeCompanies = volunteer.activeCompanies.filter(companyId => companyId.toString() !== request.company._id.toString());
      volunteer.pendingCompanies = volunteer.pendingCompanies.filter(companyId => companyId.toString() !== request.company._id.toString());

      return volunteer.save();
    })
    .then(() => {
      request.company.activeVolunteers = request.company.activeVolunteers.filter(volunteerId => volunteerId.toString() !== request.body.volunteerId.toString());
      request.company.pendingVolunteers = request.company.pendingVolunteers.filter(volunteerId => volunteerId.toString() !== request.body.volunteerId.toString());
      return request.company.save();
    })
    .then(company => {
      return Company.findById(company._id)
        .populate('pendingVolunteers')
        .populate('activeVolunteers');
    })
    .then(company => response.json(company.getCensoredVolunteers()))
    .catch(next);
});

companyAuthRouter.delete('/company/delete', bearerAuthCompany, (request, response, next) => {
  let data = {};
  return Company.findById(request.company._id)
    .populate('pendingVolunteers')
    .populate('activeVolunteers')
    .then(company => {
      data.pending = company.pendingVolunteers;
      data.active = company.activeVolunteers;

      return Promise.all(data.pending.map(volunteer => {
        volunteer.pendingCompanies = volunteer.pendingCompanies.filter(companyId => companyId.toString() !== request.company._id.toString());
        return volunteer.save();
      }));
    })
    .then(() => {
      return Promise.all(data.active.map(volunteer => {
        volunteer.activeCompanies = volunteer.activeCompanies.filter(companyId => companyId.toString() !== request.company._id.toString());
        return volunteer.save();
      }));
    })
    .then(() => Company.remove({}))
    .then(() => response.sendStatus(204))
    .catch(next);
});
