import coap from 'coap';
import cbor from 'cbor';
import urlObject from 'url';
import {globalData, OCF_OneM2M_Mapp, Container} from "./globalData";
import {oneM2MClient} from "./oneM2M_client";


const OCF_MEDIA_TYPE = {
    APPLICATION_CBOR : {name : 'application/cbor', value : 60},
    APPLICATION_VND_OCF_CBOR : {name : 'application/vnd.ocf+cbor', value : 10000}
}

const OCF_OBSERVE_CODE = 0;

class OcfClient {

    public that = this;

    constructor() {
        this.init();

    }

    public ocf_request(target : string, _callback){
        let url = urlObject.parse(target);
        // url.method =
        // coap method 변경을 할 경우 해당 option을 통하여 처리 할 수 있다고 함
        // let coapConnection = {
        //     host: url.host,
        //     pathname: url.path,
        //     method: 'GET',
        //     confirmable: true
        // }

        let req = coap.request(url)

        // request 요청
        req.on('response', function(_res:any)  {
            // cbor decoder 생성
            const d = new cbor.Decoder();
            d.on('data', (obj:any) => {
                _callback(obj);
            });
            _res.pipe(d);
            // _callback(cbor.decode(_res.payload));
        });

        req.end()
    }

    public ocf_request_observe(target : string, _callback){
        let url = urlObject.parse(target);
        let coapConnection = {
            host: url.hostname,
            port: url.port,
            pathname: url.path,
            method: 'GET',
            confirmable: true,
            observe :true  // 해당 데이터가 있어야 listening 처리 된다.
        }
        let req = coap.request(coapConnection);
        let ocfCborType = Buffer.from(OCF_MEDIA_TYPE.APPLICATION_VND_OCF_CBOR.value.toString(16), 'hex');

        req.setOption('Accept', ocfCborType);
        req.setOption('Observe', Buffer.from(OCF_OBSERVE_CODE.toString(16), 'hex')); // ocf observe option

        // request 요청
        req.on('response', function(_res:any)  {
            // cbor decoder 생성
            const d = new cbor.Decoder();
            d.on('data', (obj:any) => {
                _callback(obj);
            });
            _res.pipe(d);

        });

        req.end()
    }

    // private hexStringToByteArray(hexString:String):Uint8Array {
    //     let convertString = hexString;
    //     if (hexString.length % 2 !== 0) {
    //         convertString = convertString.padStart(hexString.length+1, '0');
    //     }
    //     const hex = Uint8Array.from(Buffer.from(hexString, 'hex'));
    //     return hex;
    // }

    public ocf_request_put(target : string, _data, _callback){
        let url = urlObject.parse(target);
        // url.method =
        // coap method 변경을 할 경우 해당 option을 통하여 처리 할 수 있음
        let coapConnection = {
            host: url.hostname,
            port: url.port,
            pathname: url.path,
            method: 'PUT',
            confirmable: false,
        }

        const req = coap.request(coapConnection);

        let ocfCborType = Buffer.from(OCF_MEDIA_TYPE.APPLICATION_VND_OCF_CBOR.value.toString(16), 'hex');

        req.setOption('Content-Format', ocfCborType);
        req.setOption('Accept', ocfCborType);

        let bytearray = Buffer.from(cbor.encode(_data));
        req.write(bytearray);

        // request 요청
        req.on('response', function(_res:any)  {
            // cbor decoder 생성
            const d = new cbor.Decoder();
            d.on('data', (obj:any) => {
                _callback(obj);
            });
            _res.pipe(d);
            // _callback(cbor.decode(_res.payload));
        });

        req.end()
    }


    public init(){
        // TODO 여기에서 OCF에 observe 요청 날리거나 주기적으로 데이터 요청 하는거 날려야됨 setTimeout
        // 추가적으로 response 받은 oic/res 에서 observe 가 가능한 데이터인지를 확인해야한다.
        for (let i = 0; i < globalData.conf.ocf.upload.length; i++) {

            if (globalData.conf.ocf.observe) {
                // setTimeout(this.getOcfResourceData, 1000, this, globalData.conf.ocf.upload[i]);
                const temp = globalData.conf.ocf.upload[i].id.split('/');
                const ocfResourceName = temp.slice(1).join('/');
                const uri = 'coap' +'://'+ globalData.conf.ocf.host + ':' + globalData.conf.ocf.port +'/'+ocfResourceName;

                this.ocf_request_observe(uri, function(data) {
                    // 데이터를 onem2m에 전달 해야됨 // eventemitter로 전달
                    globalData.eventEmitter.emit('upload_'+globalData.conf.ocf.upload[i].ctname, data, function(ctn :Container, data){
                        let content = data;
                        oneM2MClient.create_contentInstance(ctn.parent + '/' + ctn.name, '0', content, undefined, function(status, res_body){
                            console.log('create_contentInstance callback');
                            console.log(res_body);
                        });
                    });
                });
            } else {
                setTimeout(this.getOcfResourceData, 1000, this, globalData.conf.ocf.upload[i]);
            }
        }
    }

    // 데이터 조회
    public getOcfResourceData(_this : OcfClient , mapp : OCF_OneM2M_Mapp){

        // const _that = this;
        const temp = mapp.id.split('/');
        const deviceId = temp[0];
        const ocfResourceName = temp.slice(1).join('/');

        const uri = 'coap' +'://'+ globalData.conf.ocf.host + ':' + globalData.conf.ocf.port +'/'+ocfResourceName;

        _this.ocf_request(uri, function(data){
            // 데이터를 onem2m에 전달 해야됨 // eventemitter로 전달
            globalData.eventEmitter.emit('upload_'+mapp.ctname, data, function(ctn :Container, data){
                let content = data;
                oneM2MClient.create_contentInstance(ctn.parent + '/' + ctn.name, '0', content, undefined, function(status, res_body){
                    console.log('create_contentInstance callback');
                    console.log(res_body);
                });
            });
            // 재귀 호출
            setTimeout(_this.getOcfResourceData, 10000, _this, mapp);
        });
    }
}

const ocfClient = new OcfClient();

interface OCF_Response {
    anchor : string ;
    href : string ;
    rt : string[] ;
    if : string[] ;
    p : any ;
    eps : OCP_EndPoint[] ;
}

interface OCP_EndPoint {
    ep : string ;
}

export {ocfClient, OCF_Response, OCP_EndPoint, OCF_OneM2M_Mapp}