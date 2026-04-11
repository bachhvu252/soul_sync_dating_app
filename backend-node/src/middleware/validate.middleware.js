/**
 * src/middleware/validate.middleware.js
 *
 * Generic Joi validation middleware factory.
 * Usage:
 *   router.post('/register', validate(registerSchema), authController.register);
 *
 * Validates `req.body` against the provided Joi schema and returns 400
 * with descriptive messages on failure.
 */

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    const messages = error.details.map((d) => d.message);
    return res.status(400).json({ success: false, error: messages.join('; ') });
  }
  next();
};

module.exports = { validate };
