'use strict';

const {Router} = require('express');
const jsonParser = require('express').json();
const httpErrors = require('http-errors');
const Volunteer = require('../model/volunteer');
const Company = require('../model/company');
const basicAuthVolunteer = require('../lib/basic-auth-middleware')(Volunteer);
const bearerAuthVolunteer = require('../lib/bearer-auth-middleware')(Volunteer);

const volunteerAuthRouter = module.exports = new Router();

volunteerAuthRouter.post('/volunteer/signup', jsonParser, (request, response, next) => {
  let filter = /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/; //eslint-disable-line

  if(!request.body.firstName || !request.body.lastName || !request.body.userName || !request.body.password || !request.body.email || !request.body.phoneNumber) {
    return next(new httpErrors(400, '__ERROR__ <firstName>, <lastName>, <userName>, <email>, <phoneNumber>, and <password> are required to sign up.'));
  }

  if(!filter.test(request.body.email))
    return next(new httpErrors(400, '__ERROR__ valid email required'));

  return Volunteer.create(request.body.firstName, request.body.lastName, request.body.userName, request.body.password, request.body.email, request.body.phoneNumber)
    .then(volunteer => volunteer.createToken())
    .then(token => response.json({token}))
    .catch(next);
});

volunteerAuthRouter.get('/volunteer/login', basicAuthVolunteer, (request, response, next) => {
  return request.volunteer.createToken()
    .then(token => response.json({token}))
    .catch(next);
});

volunteerAuthRouter.get('/volunteer/opportunities', bearerAuthVolunteer, (request, response, next) => {
  return Company.find({})
    .then(companies => response.json({
      companies: companies.map(company => ({
        companyId: company._id,
        companyName: company.companyName,
        phoneNumber: company.phoneNumber,
        email: company.email,
        website: company.website,
      })),
    }))
    .catch(next);
});

volunteerAuthRouter.get('/volunteer/pending', bearerAuthVolunteer, (request, response, next) => {
  return Volunteer.findById(request.volunteer._id)
    .populate('pendingCompanies')
    .then(volunteer => response.json({pendingCompanies: volunteer.getCensoredCompanies().pendingCompanies}))
    .catch(next);
});

volunteerAuthRouter.get('/volunteer/active', bearerAuthVolunteer, (request, response, next) => {
  return Volunteer.findById(request.volunteer._id)
    .populate('activeCompanies')
    .then(volunteer => response.json({activeCompanies: volunteer.getCensoredCompanies().activeCompanies}))
    .catch(next);
});

volunteerAuthRouter.put('/volunteer/update', bearerAuthVolunteer, jsonParser, (request, response, next) => {
  if(!(request.body.userName || request.body.password || request.body.email || request.body.phoneNumber || request.body.firstName || request.body.lastName))
    return next(new httpErrors(400, '__ERROR__ <userName>, <email>, <phoneNumber>, <firstName>, <lastName> or <password> are required to update volunteer info'));

  let data = {};
  for(let prop of Object.keys(request.body)){
    if(request.volunteer[prop])
      request.volunteer[prop] = request.body[prop];
  }

  return request.volunteer.save()
    .then(volunteer => request.body.password ? request.volunteer.changePassword(request.body.password) : volunteer)
    .then(volunteer => {
      data.userName = volunteer.userName;
      data.email = volunteer.email;
      data.phoneNumber = volunteer.phoneNumber;
      data.firstName = volunteer.firstName;
      data.lastName = volunteer.lastName;

      return request.body.userName || request.body.password ? volunteer.createToken() : null;
    })
    .then(token => {
      if(token)
        data.token = token;
      return response.json(data);
    })
    .catch(next);
});

volunteerAuthRouter.put('/volunteer/apply', bearerAuthVolunteer, jsonParser, (request, response, next) => {
  if(!request.body.companyId)
    return next(new httpErrors(400, '__ERROR__ <companyId> is required to apply.'));

  return Company.findById(request.body.companyId)
    .then(company => {
      for(let volunteer of company.activeVolunteers) {
        if(volunteer.toString() === request.volunteerId.toString())
          throw new httpErrors(409, '__ERROR__ duplicate volunteer.');
      }

      for(let volunteer of company.pendingVolunteers) {
        if(volunteer.toString() === request.volunteerId.toString()) {
          throw new httpErrors(409, '__ERROR__ duplicate volunteer.');
        }
      }

      company.pendingVolunteers.push(request.volunteerId);
      return company.save();
    })
    .then(() => Volunteer.findById(request.volunteerId))
    .then(volunteer => {
      volunteer.pendingCompanies.push(request.body.companyId);
      return volunteer.save();
    })
    .then(volunteer => {
      return Volunteer.findById(volunteer._id)
        .populate('pendingCompanies')
        .populate('activeCompanies');
    })
    .then(volunteer => response.json(volunteer.getCensoredCompanies()))
    .catch(next);
});

volunteerAuthRouter.put('/volunteer/leave', bearerAuthVolunteer, jsonParser, (request, response, next) => {
  if(!request.body.companyId)
    return next(new httpErrors(400, '__ERROR__ company id is required'));

  return Company.findById(request.body.companyId)
    .then(company => {
      if(!company)
        throw new httpErrors(404, '__ERROR__ company not found.');

      company.activeVolunteers = company.activeVolunteers.filter(volunteerId => volunteerId.toString() !== request.volunteer._id.toString());
      company.pendingVolunteers = company.pendingVolunteers.filter(volunteerId => volunteerId.toString() !== request.volunteer._id.toString());

      return company.save();
    })
    .then(() => {
      request.volunteer.activeCompanies = request.volunteer.activeCompanies.filter(companyId => companyId.toString() !== request.body.companyId.toString());
      request.volunteer.pendingCompanies = request.volunteer.pendingCompanies.filter(companyId => companyId.toString() !== request.body.companyId.toString());
      return request.volunteer.save();
    })
    .then(volunteer => {
      return Volunteer.findById(volunteer._id)
        .populate('pendingCompanies')
        .populate('activeCompanies');
    })
    .then(volunteer => response.json(volunteer.getCensoredCompanies()))
    .catch(next);
});

volunteerAuthRouter.delete('/volunteer/delete', bearerAuthVolunteer, (request, response, next) => {
  let data = {};
  return Volunteer.findById(request.volunteer._id)
    .populate('pendingCompanies')
    .populate('activeCompanies')
    .then(volunteer => {
      data.pending = volunteer.pendingCompanies;
      data.active = volunteer.activeCompanies;

      return Promise.all(data.pending.map(company => {
        company.pendingVolunteers = company.pendingVolunteers.filter(volunteerId => volunteerId.toString() !== request.volunteer._id.toString());
        return company.save();
      }));
    })
    .then(() => {
      return Promise.all(data.active.map(company => {
        company.activeVolunteers = company.activeVolunteers.filter(volunteerId => volunteerId.toString() !== request.volunteer._id.toString());
        return company.save();
      }));
    })
    .then(() => Volunteer.remove({}))
    .then(() => response.sendStatus(204))
    .catch(next);
});
