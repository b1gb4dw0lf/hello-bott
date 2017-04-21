'use strict';

const _ = require('lodash');
const config = require('config');
const debug = require('debug')('manager');
const Workday = require('../models/workday');
const LeakableBotError = require('./errors/leakableError');


class Manager {
  /**
   * @Constructor
   * @param {Object} commandModules
   */
  constructor(bot, commandModules) {
    this.bot = bot;
    this.commands = {}; // Maybe use Set?
    debug('Manager created.');

    if (commandModules) {
      _.forEach(commandModules, (module, key) => {
        if (module.dispatchCommand) {
          this.commands['_' + key] = module;
          debug(`Add module '${key}'.`);
        } else {
          throw new Error('Module does not have dispatchCommand() method.');
        }
      });
    }
  }


  /**
   * Listens for mentions or direct messages to the bot.
   */
  listen() {
    this.bot.on('message', (message) => {
      debug('Message: %o', message);

      let messageText = message.text.trim();

      //If not a public or a direct message.
      if (message.channel[0] !== 'C' && message.channel[0] !== 'D') {
        return;
      }

      if (message.text.indexOf(`<@${this.bot.id}>`) == 0)
        messageText = messageText.substr(messageText.indexOf(' ') + 1);

      message.text = messageText;
      debug(`Beginning to dispatch ${message.text}`);
      this.dispatchCommand(message);
    });
    debug('Listening for messages');
  }


  /**
   * Calls the corresponding command's function.
   * @param {String} message
   * @private
   */
  async dispatchCommand(message) {
    try {
      let command = '_' + (message.text.substr(0, message.text.indexOf(' ')) || message.text);
      let text = '';

      if (message.text.indexOf(' ') != -1) {
        text = message.text.substr(message.text.indexOf(' ') + 1);
      }

      debug(`Received '${command}', is user owner: ${this.bot.owner.id == message.user}.`);

      if (this.commands[command]) {
        message.text = text;
        debug(`Redirecting message to ${command}`);
        debug(`List of comands are %o`, this.commands);
        return this.commands[command].dispatchCommand(message, message.user);
      }

      // TODO: Think more on this.
      // Can someone also reach class properties from this?
      debug(`Dispatching command '${command}' for ${message.user}`);
      this[command](text || '', message.user, message.channel);
    } catch (err) {
      debug(`'${message.text}' is failed to be dispatched.`, err);
      let errorMessage = err.name == 'LeakableBotError' ? err.message : 'problems captain!';
      this.send(`<@${message.user}>, ${errorMessage}`, message.channel);
    }
  }


  /**
   * Starts the workday of the user.
   * @param {String} text
   * @param {String} slackId
   * @param {String} channel
   * @private
   */
  async _start(text, slackId, channel) {
    try {
      // We don't want to start a multiple workdays for the sameday.
      // Will throw error if not ended.
      await Workday.isLastDayEnded(slackId);

      let now = new Date();
      let newWorkday = new Workday({
        slackId: slackId,
        begin: now,
        intervals: [{begin: now, description: text}]
      });

      let workday = await newWorkday.save();
      this.send(`<@${slackId}>'s workday is just started with ${text}.`, channel);
    } catch (err) {
      console.log(err);
      debug(`Error while starting ${slackId}'s day.`, err);
      let errorMessage = err.name == 'LeakableBotError' ? err.message : 'problems captain!';
      this.send(`<@${slackId}>, ${errorMessage}`, channel);
    }
  }


  /**
   * Puts a break between work hours.
   * @param {String} text
   * @param {String} slackId
   * @param {String} channel
   * @private
   */
  async _break(text, slackId, channel) {
    try {
      let lastWorkday = await Workday.getLastWorkdayByUser(slackId);
      await lastWorkday.giveBreak();
      this.send(`<@${slackId}> is giving a break. (${text})`, channel);
    } catch(err) {
      debug(`Error while ${slackId} is trying to give a break`, err);
      let errorMessage = err.name == 'LeakableBotError' ? err.message : 'problems captain!';
      this.send(`<@${slackId}>, ${errorMessage}`, channel);
    }
  }


  /**
   * Continues after break or ended day by overriding the 'end' field of
   * the workday.
   * @param {String} text
   * @param {String} slackId
   * @param {String} channel
   * @private
   */
  async _continue(text, slackId, channel) {
    try {
      let lastWorkday = await Workday.getLastWorkdayByUser(slackId);
      await lastWorkday.continueDay(text);
      this.send(`<@${slackId}>'s workday continues with ${text}.`, channel);
    } catch(err) {
      debug(`Error while ${slackId} is trying to continue work`, err);
      let errorMessage = err.name == 'LeakableBotError' ? err.message : 'problems captain!';
      this.send(`<@${slackId}>, ${errorMessage}`, channel);
    }
  }


  /**
   * Ends the workday of the user.
   * @param {String} text
   * @param {String} slackId
   * @param {String} channel
   * @private
   */
  async _end(text, slackId, channel) {
    try {
      let lastWorkday = await Workday.getLastWorkdayByUser(slackId);
      await lastWorkday.endDay();
      this.send(`End of the workday for <@${slackId}>.`, channel);
    } catch(err) {
      debug(`Error while ${slackId} is trying end the workday.`, err);
      let errorMessage = err.name == 'LeakableBotError' ? err.message : 'problems captain!';
      this.send(`<@${slackId}>, ${errorMessage}`, channel);
    }
  }


  /**
   * Say something to channel.
   * @param {String} message
   * @param {String} channel
   */
  send(message, channel) {
    this.bot.rtm.sendMessage(message, this.bot.channels[channel] || channel);
  }
}

module.exports = Manager;
