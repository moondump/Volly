# Code Review

#### Repo README Appearance
Nice! The logo is looking good, the badges are looking good. It all has a very
professional look to it. The Shema diagram is great.

Nice HTTP GET requests samples.

#### Overall Code Style
You have long lines of code. `company-auth-router.js` has several lines that
are 80, 100, and even over 120 characters long.

See `// REVIEW:` comments for specific tips.

Original code:

```js
if(!request.body.textMessage || !request.body.volunteers || !Array.isArray(request.body.volunteers) || !request.body.volunteers.length) {
  return next(new httpErrors(400, '__ERROR__ <textMessage> and <volunteers> (array) are required, and volunteers must not be empty.'));
}

```

Using vars to make lines shorter:

```js
// REVIEW: make the if statement condition line shorter by creating local
// variables for commonly used properties. Sometimes it's worth it to create
// a variable instead of drilling down through `request.body.volunteers` over
// and over.
let body = request.body;
let volunteers = body.volunteers;
if(!body.textMessage || !volunteers || !Array.isArray(volunteers) || !volunteers.length) {
  return next(new httpErrors(400, '__ERROR__ <textMessage> and <volunteers> (array) are required, and volunteers must not be empty.'));
}
```

Giving more-specific errors to reduce line length:

```js
// REVIEW: The if statement above actually tries to handle many different
// things. Splitting the if statement into more specific cases will make the
// code more readable AND you get the extra bonus of being able to return
// more specific error messages
if(!body.textMessage) {
  return next(new httpErrors(400, '__ERROR__ <textMessage> required'));
}else if (!volunteers) {
  return next(new httpErrors(400, '__ERROR__ <volunteers> required'));
} else if (!Array.isArray(volunteers)) {
  return next(new httpErrors(400, '__ERROR__ <volunteers> must be array'));
} else if (!volunteers.length) {
  return next(new httpErrors(400, '__ERROR__ <volunteers> array must not be empty'));
}
```

#### File Structure
* The `lib` directory feels slightly cluttered at first glance
* Consider creating a directory `lib/middleware`
* Why are the routes defined in a folder above where the server lives?
* Consider creating a directory `lib/routes` and putting them there.

#### Models
Nice models. It's easy to see all the properties for the company and the
voluneteers. Good job taking advantage of attaching methods to the models.


#### Tests


