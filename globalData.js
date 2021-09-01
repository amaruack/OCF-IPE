"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BODY_TYPE = exports.PROTOCOL_TYPE = exports.HTTP_METHOD = exports.ONEM2M_STATE = exports.GlobalData = exports.globalData = void 0;
var fs_1 = __importDefault(require("fs"));
var events_1 = __importDefault(require("events"));
var ONEM2M_STATE;
(function (ONEM2M_STATE) {
    ONEM2M_STATE[ONEM2M_STATE["CREATE_AE"] = 0] = "CREATE_AE";
    ONEM2M_STATE[ONEM2M_STATE["RETRIVE_AE"] = 1] = "RETRIVE_AE";
    ONEM2M_STATE[ONEM2M_STATE["CREATE_CONTAINER"] = 2] = "CREATE_CONTAINER";
    ONEM2M_STATE[ONEM2M_STATE["RETRIVE_CONTAINER"] = 3] = "RETRIVE_CONTAINER";
})(ONEM2M_STATE || (ONEM2M_STATE = {}));
exports.ONEM2M_STATE = ONEM2M_STATE;
var HTTP_METHOD;
(function (HTTP_METHOD) {
    HTTP_METHOD["GET"] = "get";
    HTTP_METHOD["POST"] = "post";
    HTTP_METHOD["PUT"] = "put";
    HTTP_METHOD["DELETE"] = "delete";
})(HTTP_METHOD || (HTTP_METHOD = {}));
exports.HTTP_METHOD = HTTP_METHOD;
var PROTOCOL_TYPE;
(function (PROTOCOL_TYPE) {
    PROTOCOL_TYPE["HTTP"] = "http";
    PROTOCOL_TYPE["MQTT"] = "mqtt";
    PROTOCOL_TYPE["COAP"] = "coap";
    PROTOCOL_TYPE["WEB_SOCKET"] = "ws";
})(PROTOCOL_TYPE || (PROTOCOL_TYPE = {}));
exports.PROTOCOL_TYPE = PROTOCOL_TYPE;
var BODY_TYPE;
(function (BODY_TYPE) {
    BODY_TYPE["JSON"] = "json";
    BODY_TYPE["XML"] = "xml";
    BODY_TYPE["CBOR"] = "cbor";
})(BODY_TYPE || (BODY_TYPE = {}));
exports.BODY_TYPE = BODY_TYPE;
var GlobalData = /** @class */ (function () {
    function GlobalData() {
        this.resp_mqtt_ri_arr = [];
        this.resp_mqtt_path_arr = {};
        this.socket_q = {};
        this.conf = {};
        this.mqtt_client = null;
        this.init();
    }
    GlobalData.prototype.init = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _that;
            return __generator(this, function (_a) {
                _that = this;
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _that.eventEmitter = new events_1.default();
                        _that.sh_state = ONEM2M_STATE.RETRIVE_AE;
                        _that.conf = JSON.parse(fs_1.default.readFileSync('setting.json', 'utf8'));
                        _that.conf.onem2m.ae = _that.createAe(_that.conf);
                        _that.conf.onem2m.ae.ctn = _that.createCnt(_that.conf);
                        resolve();
                    })];
            });
        });
    };
    GlobalData.prototype.createAe = function (option) {
        var ae = option.onem2m.ae;
        ae.id = 'S' + option.onem2m.ae.name;
        ae.parent = '/' + option.onem2m.csebase.name;
        return ae;
    };
    GlobalData.prototype.createCnt = function (option) {
        var _that = this;
        var ctns = new Array;
        var check_function = function (ctns, ctnName) {
            var check = false;
            ctns.forEach(function (_data) {
                if (_data.name == ctnName) {
                    return check = true;
                }
            });
            return check;
        };
        option.ocf.upload.forEach(function (mapp) {
            var ctn = {};
            if (!check_function(ctns, mapp.ctname)) {
                // let ctn = new Container();
                ctn.parent = '/' + option.onem2m.csebase.name + '/' + option.onem2m.ae.name;
                ctn.name = mapp.ctname;
                ctns.push(ctn);
            }
            _that.eventEmitter.on('upload_' + mapp.ctname, function (data, _callback) {
                // TODO 원하는 content format 이 있을 경우 변환
                _callback(ctn, data);
            });
        });
        option.ocf.download.forEach(function (mapp) {
            var ctn = {};
            if (!check_function(ctns, mapp.ctname)) {
                ctn.parent = '/' + option.onem2m.csebase.name + '/' + option.onem2m.ae.name;
                ctn.name = mapp.ctname;
                ctns.push(ctn);
            }
            _that.eventEmitter.on('download_' + mapp.ctname, function (data, _callback) {
                _callback(ctn, data);
            });
        });
        return ctns;
    };
    return GlobalData;
}());
exports.GlobalData = GlobalData;
var globalData = new GlobalData();
exports.globalData = globalData;
