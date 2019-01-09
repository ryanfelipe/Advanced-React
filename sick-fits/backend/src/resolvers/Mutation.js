const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');

const Mutations = {
  createItem(parent, args, ctx, info) {
    //  TODO check if they are logged in
    const item = ctx.db.mutation.createItem(
      {
        data: {
          ...args,
        },
      },
      info
    );

    return item;
  },

  updateItem(parent, args, ctx, info) {
    //  Take a copy of the updates
    const updates = { ...args };
    //  Remove the ID from the updates
    delete updates.id;
    //  Run the update method
    return ctx.db.mutation.updateItem(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  async deleteItem(parent, args, ctx, info) {
    const where = { id: args.id };
    //  Find the item
    const item = await ctx.db.query.item(
      { where },
      `{ id
    title}`
    );
    //  Check if item exists and user has permissions
    //  Delete item
    return ctx.db.mutation.deleteItem({ where }, info);
  },
  async signup(parent, args, ctx, info) {
    //  lowercase the email
    args.email = args.email.toLowerCase();

    //  HASH THE PASSWORD //
    const password = await bcrypt.hash(args.password, 10);

    //  create the user in the database
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: {
            set: ['USER'],
          },
        },
      },
      info
    );
    //  create theJWT token for users
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    //  set jwt as a cookie on the response
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 Year Cookie
    });

    return user;
  },
  async signin(parent, { email, password }, ctx, info) {
    //  check if that email is registered
    const user = await ctx.db.query.user({ where: { email } });
    if (!user) {
      throw new Error(`No such user for email: ${email}`);
    }
    //  check if the password matches
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error(`Invalid Password`);
    }
    //  generate the JWT Token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    //  Set the cookie with the token
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 Year Cookie
    });
    //  Return User
    return user;
  },
  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return { message: 'Sign out Successful!' };
  },
  async requestReset(parent, args, ctx, info) {
    //  Check if the user exists
    const user = await ctx.db.query.user({ where: { email: args.email } });
    if (!user) {
      throw new Error('No user found');
    }
    //  Set a Reset Token and Expiry on that user
    const resetToken = (await promisify(randomBytes)(20)).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 Hour from now
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry },
    });
    return { message: 'Reset' };
    //  Email them that reset token
  },
  async resetPassword(parent, args, ctx, info) {
    //  check if the passwords match
    if (args.password !== args.confirmPassword) {
      throw new Error("Your passwords don't match");
    }
    //  check the token is valid
    //  check token expiry
    const [user] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000,
      },
    });
    if (!user) {
      throw new Error('Your token has Expired!');
    }
    //  hash the new password
    const password = await bcrypt.hash(args.password, 10);
    //  save the new password & remove resetToken fields
    const updatedUser = await ctx.db.mutation.updateUser({
      where: { email: user.email },
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });
    //  generate JWT
    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);
    //  set the JWT
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365,
    });
    //  return the new user
    return updatedUser;
  },
};

module.exports = Mutations;
