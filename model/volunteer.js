'use strict';

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const httpErrors = require('http-errors');
const jsonWebToken = require('jsonwebtoken');
const mongoose = require('mongoose');

const volunteerSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
  },

  userName: {
    type: String,
    unique: true,
    required: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,
  },

  tokenSeed: {
    type: String,
    required: true,
    unique: true,
  },

  passwordHash: {
    type: String,
    required: true,
  },

  companies: [{
    type : mongoose.Schema.Types.ObjectId,
    ref : 'company',
  }],
},{
  usePushEach : true,

});

volunteerSchema.methods.verifyPassword = function(password) {
  return bcrypt.compare(password, this.passwordHash)
    .then(response => {
      if(!response) {
        throw new httpErrors(401, '__AUTH__ unauthorized');
      }
      return this;
    });
};

volunteerSchema.methods.createToken = function() {
  this.tokenSeed = crypto.randomBytes(64).toString('hex');
  return this.save()
    .then(volunteer => {
      return jsonWebToken.sign({
        tokenSeed: volunteer.tokenSeed,
      }, process.env.SALT_SECRET);
    });
};

const Volunteer = module.exports = mongoose.model('volunteer', volunteerSchema);

Volunteer.create = (name, userName, password, email) => {
  const HASH_SALT_ROUNDS = 8;
  return bcrypt.hash(password, HASH_SALT_ROUNDS)
    .then(passwordHash => {
      let tokenSeed = crypto.randomBytes(64).toString('hex');
      return new Volunteer({
        name,
        userName,
        passwordHash,
        email,
        tokenSeed,
      }).save();
    });
};

Volunteer.model = 'volunteer';