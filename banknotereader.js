var Promise = require('promise');
var CCCommand = require('./cctalk-message');
var CCDevice = require('./device');
var EventEmitter = require('events');
var compose = require('./compose');

var CCDeviceEmitter = compose(CCDevice, EventEmitter);

function BanknoteReader(bus, config)
{
  EventEmitter.call(this);
  CCDevice.apply(this, arguments);

  this.poll = this.poll.bind(this);
  this.ready = false;

  // register last, after all device type specific variables have been set up!
  this.bus.registerDevice(this);
}

BanknoteReader.prototype = new CCDeviceEmitter();

BanknoteReader.prototype.onBusReady = function onBusReady()
{
  this.sendCommand(new CCCommand(this.config.src, this.config.dest, 254, new Uint8Array(0),16))
    .then(function()
    {
      this.ready = true;
      this.pollInterval = setInterval(this.poll, 200);
      this.emit('ready');
    }.bind(this),
    function(error)
    {
      this.emit('error', error);
    }.bind(this));

};

BanknoteReader.prototype.onBusClosed = function onBusClosed()
{
  this.ready = false;
};

BanknoteReader.prototype.poll = function poll()
{
  this.sendCommand(new CCCommand(0, 0, BanknoteReader.commands.readBufferedCredit, new Uint8Array(0),16))
  .then(function(reply)
  {
    if(this.eventBuffer && reply.data[0] != this.eventBuffer[0])
    {
      var dEventCounter = reply.data[0] -  this.eventBuffer[0];
      if(dEventCounter > 5)
        this.emit('error', new Error('Event overflow. Events generated by the coin detector were lost!'));

      var maxI = Math.min(reply.data.length, dEventCounter*2+1);

      for(var i = 1; i < maxI; i += 2)
      {
        var type = reply.data[i+1];

        switch(type)
        {
          case BanknoteReader.eventCodes.accepted:
            var coin = reply.data[i];
            this.emit(BanknoteReader.eventCodes[type], coin);
            break;
          case BanknoteReader.eventCodes.inhibited:
          case BanknoteReader.eventCodes.rejected:
            this.emit(BanknoteReader.eventCodes[type]);
            break;
          case BanknoteReader.eventCodes.return:
            this.emit('return');
            break;
          default:
            this.emit('malfunction', [type, reply.data[i]]);
            this.emit('error', new Error('The device reported a malfunction: Code ' + type + ', ' + reply.data[i]));
        }
      }
      //console.log(reply.data);
    }
    this.eventBuffer = reply.data;
  }.bind(this));
};

BanknoteReader.prototype.setAcceptanceMask = function setAcceptanceMask(acceptanceMask)
{
  return this.sendCommand(new CCCommand(0, 0, BanknoteReader.commands.modifyInhibitStatus,
                                        Uint8Array.from([ acceptanceMask & 0xFF, (acceptanceMask >> 8) & 0xFF ]),16))
    .catch(function(e)
    {
      this.emit('error', e);
      throw e;
    }.bind(this));
};

BanknoteReader.prototype.enableAcceptance = function enableAcceptance()
{
  return this.sendCommand(new CCCommand(0, 0, BanknoteReader.commands.modifyMasterInhibit, new Uint8Array(1).fill(0xFF),16))
    .catch(function(e)
    {
      this.emit('error', e);
      throw e;
    }.bind(this));
};

BanknoteReader.prototype.disableAcceptance = function disableAcceptance()
{
  return this.sendCommand(new CCCommand(0, 0, BanknoteReader.commands.modifyMasterInhibit, new Uint8Array(1).fill(0x00),16))
    .catch(function(e)
    {
      this.emit('error', e);
      throw e;
    }.bind(this));
};

BanknoteReader.prototype.getCoinName = function getCoinName(channel)
{
  return this.sendCommand(new CCCommand(0, 0, BanknoteReader.commands.requestCoinId,
                                        Uint8Array.from([ channel ]),16))
  .then(function(reply)
  {
    return String.fromCharCode.apply(null, reply.data);
  }.bind(this));
};

BanknoteReader.prototype.getCoinPosition = function getCoinPosition(channel)
{
  return this.sendCommand(new CCCommand(0, 0, BanknoteReader.commands.requestCoinPosition,
                                        Uint8Array.from([ channel ]),16));
};

BanknoteReader.commands =
{
  requestStatus: 248,
  requestVariableSet: 247,
  requestManufacturerId: 246,
  requestEquipmentCategoryId: 245,
  requestProductCode: 244,
  requestDatabaseVersion: 243,
  requestSerialNumber: 242,
  requestSoftwareRevision: 241,
  testSolenoids: 240,
  testOutputLines: 238,
  readInputLines: 237,
  readOptoStates: 236,
  latchOutputLines: 233,
  performSelfCheck: 232,
  modifyInhibitStatus: 231,
  requestInhibitStatus: 230,
  readBufferedCredit: 229,
  modifyMasterInhibit: 228,
  requestMasterInhibitStatus: 227,
  requestInsertionCounter: 226,
  requestAcceptCounter: 225,
  modifySorterOverrideStatus: 222,
  requestSorterOverrideStatus: 221,
  requestDataStorageAvailability: 216,
  requestOptionFlags: 213,
  requestCoinPosition: 212,
  modifySorterPath: 210,
  requestSorterPath: 209,
  teachModeControl: 202,
  requestTeachStatus: 201,
  requestCreationDate: 196,
  requestLastModificationDate: 195,
  requestRejectCounter: 194,
  requestFraudCounter: 193,
  requestBuildCode: 192,
  modifyCoinId: 185,
  requestCoinId: 184,
  uploadWindowData: 183,
  downloadCalibrationInfo: 182,
  requestThermistorReading: 173,
  requestBaseYear: 170,
  requestAddressMode:169,
  requestCommsRevision: 4,
  clearCommsStatusVariables: 3,
  requestCommsStatusVariables: 2,
  resetDevice: 1
};

BanknoteReader.eventCodes =
{
  254: 'return',
  20: 'string',
  19: 'slow',
  13: 'busy',
  8: 'following',
  2: 'inhibited',
  1: 'rejected',
  0: 'accepted',

  accepted: 0,
  rejected: 1,
  inhibited: 2,
  following: 8,
  busy: 13,
  slow: 19,
  string: 20,
  'return': 254
};

module.exports = exports = BanknoteReader;