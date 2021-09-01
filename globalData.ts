import fs from 'fs';
import EventEmitter from "events";
import path from "path";

enum ONEM2M_STATE {
    CREATE_AE,
    RETRIVE_AE,
    CREATE_CONTAINER,
    RETRIVE_CONTAINER
}

enum HTTP_METHOD {
    GET = 'get',
    POST = 'post',
    PUT = 'put',
    DELETE = 'delete'
}

enum PROTOCOL_TYPE {
    HTTP = 'http',
    MQTT = 'mqtt',
    COAP = 'coap',
    WEB_SOCKET = 'ws'
}

enum BODY_TYPE {
    JSON = 'json',
    XML = 'xml',
    CBOR = 'cbor'
}

class GlobalData {

    conf:Option = {} as Option ;
    sh_state ;
    eventEmitter ;

    // resp_mqtt_ri_arr = [];
    // resp_mqtt_path_arr = {};
    // socket_q = {};
    // mqtt_client = null;
    // callback_q ;

    constructor() {
        this.init();
    }

    public async init() : Promise<any> {
        let _that = this;
        return new Promise(function(resolve, reject) {
            _that.eventEmitter = new EventEmitter();
            _that.sh_state = ONEM2M_STATE.RETRIVE_AE;
            const home: string = <string>process.env.OCF_IPE_HOME;
            if (!home) {
                console.log(`system env OCF_IPE_HOME is not setting`);
                process.exit(0);
            }
            const filePath = path.join(home, 'setting.json');
            _that.conf = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            _that.conf.onem2m.ae = _that.createAe(_that.conf);
            _that.conf.onem2m.ae.ctn = _that.createCnt(_that.conf);
            resolve();
        });
    }

    public createAe(option : Option) : AE {
        let ae = option.onem2m.ae;
        ae.id = 'S' + option.onem2m.ae.name;
        ae.parent = '/' + option.onem2m.csebase.name
        return ae;
    }

    public createCnt(option : Option) : Container[] {

        let _that = this;
        let ctns = new Array;

        let check_function = function(ctns : Container[], ctnName : string){
            let check = false;
            ctns.forEach(function (_data){
                if (_data.name == ctnName) {
                    return check = true;
                }
            })
            return check;
        }

        option.ocf.upload.forEach(function(mapp){
            let ctn = {} as Container;
            if (!check_function(ctns, mapp.ctname)){
                // let ctn = new Container();
                ctn.parent = '/' + option.onem2m.csebase.name + '/' + option.onem2m.ae.name;
                ctn.name = mapp.ctname;
                ctns.push(ctn);
            }

            _that.eventEmitter.on('upload_'+mapp.ctname, function(data, _callback){
                // TODO 원하는 content format 이 있을 경우 변환
                _callback(ctn, data);
            })
        })

        option.ocf.download.forEach(function(mapp){
            let ctn = {} as Container
            if (!check_function(ctns, mapp.ctname)) {
                ctn.parent = '/' + option.onem2m.csebase.name + '/' + option.onem2m.ae.name;
                ctn.name = mapp.ctname;
                ctns.push(ctn);
            }

            _that.eventEmitter.on('download_'+mapp.ctname, function(data, _callback){
                _callback(ctn, data);
            })

        })
        return ctns;
    }

}

interface Option {
    onem2m: OneM2MOption;
    ocf: OCFOption;
}

interface OCFOption {
    host : string;
    port : string;
    observe : boolean;
    upload : OCF_OneM2M_Mapp[];
    download : OCF_OneM2M_Mapp[];
}

interface OCF_OneM2M_Mapp {
    ctname : string;
    id : string;
    ep : string; // coap만 셋팅하는 걸로
}

interface OneM2MOption {
    csebase : CSEBase;
    ae : AE;
    bodytype : string;
    protocol : string;
    host : string;
    port : string;

}

interface AE {
    name : string;
    id : string;
    parent : string;
    appid : string;
    ctn : Container[];
}

interface CSEBase {
    host : string;
    port : string;
    id : string;
    name : string;
}

interface Container {
    parent : string;
    name : string;
}

const globalData = new GlobalData();

export {globalData, CSEBase, Option, OCF_OneM2M_Mapp, OneM2MOption, Container, GlobalData, ONEM2M_STATE, HTTP_METHOD, PROTOCOL_TYPE, BODY_TYPE};
