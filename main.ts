import {globalData, ONEM2M_STATE} from './globalData';
import {oneM2MClient} from './oneM2M_client';
import {ocfClient, OCF_Response, OCP_EndPoint} from './ocf_client';

let ocf_oic_d_receive = function(data){
    console.log(data);
}

let ocf_oic_res_receive = function(datas){
    console.log(datas);
    datas.forEach(function(data:OCF_Response) {
        let eps = data.eps;
        eps.forEach(function(ep : OCP_EndPoint) {
            console.log(ep.ep);
        })
    })
}

// ocfClient.ocf_request_observe("coap://10.10.0.198:64931/a/light", ocf_oic_d_receive);

// ocfClient.ocf_request_put("coap://10.10.0.198:51117/a/light", {value:false, dimmingSetting : 50}, ocf_oic_d_receive);

// // ocf device retrieve
ocfClient.ocf_request("coap://10.10.0.198:5683/oic/res", ocf_oic_d_receive);
//
// // ocf resource retrieve
// ocfClient.ocf_request("coap://10.10.0.198:61327/oic/res", ocf_oic_res_receive );


// let request_count = 0;
//
// let request_oneM2M_setting = function() {
//     if (globalData.sh_state == ONEM2M_STATE.CREATE_AE) {
//         oneM2MClient.create_ae(globalData.conf.onem2m.ae.parent, globalData.conf.onem2m.ae.name, globalData.conf.onem2m.ae.appid, create_ae_callback);
//     } else if (globalData.sh_state == ONEM2M_STATE.RETRIVE_AE) {
//         request_count = 0;
//         oneM2MClient.retrieve_ae(globalData.conf.onem2m.ae.parent + '/' + globalData.conf.onem2m.ae.name, retrieve_ae_callback);
//     } else if (globalData.sh_state == ONEM2M_STATE.RETRIVE_CONTAINER) {
//         // for (let i = 0; i < globalData.conf.onem2m.ae.ctn.length ; i++) {
//             let data = globalData.conf.onem2m.ae.ctn[request_count];
//             oneM2MClient.retrieve_container(globalData.conf.onem2m.ae.parent + '/' + globalData.conf.onem2m.ae.name + '/' + data.name, request_count , retrieve_container_callback);
//         // }
//     } else if (globalData.sh_state == ONEM2M_STATE.CREATE_CONTAINER) {
//         // for (let i = 0; i < globalData.conf.onem2m.ae.ctn.length ; i++) {
//             let data = globalData.conf.onem2m.ae.ctn[request_count];
//             oneM2MClient.create_container(globalData.conf.onem2m.ae.parent + '/' + globalData.conf.onem2m.ae.name, data.name, request_count , create_container_callback);
//         // }
//     }
// }
//
// setTimeout(request_oneM2M_setting, 100);
//
// /**
//  * onem2m ae resource create call back
//  * @param status
//  * @param res_body
//  */
// let create_ae_callback = function (status, res_body) {
//     console.log(res_body);
//     if (status == 2001) {
//         globalData.sh_state = ONEM2M_STATE.RETRIVE_AE;
//         setTimeout(request_oneM2M_setting, 100);
//     } else if (status == 5106 || status == 4105) {
//         console.log('x-m2m-rsc : ' + status + ' <----');
//         globalData.sh_state = ONEM2M_STATE.RETRIVE_AE;
//         setTimeout(request_oneM2M_setting, 100);
//     } else {
//         console.log('[???} create container error!  ', status + ' <----');
//         // setTimeout(setup_resources, 3000, 'crtae');
//     }
// }
//
// /**
//  * onem2m ae resource retrieve call back
//  * @param status
//  * @param res_body
//  */
// let retrieve_ae_callback = function (status, res_body){
//     if (status == 2000) {
//         let aeid = res_body['m2m:ae']['aei'];
//         console.log('x-m2m-rsc : ' + status + ' - ' + aeid + ' <----');
//
//         if(globalData.conf.onem2m.ae.id != aeid && globalData.conf.onem2m.ae.id != ('/'+aeid)) {
//             console.log('AE-ID created is ' + aeid + ' not equal to device AE-ID is ' + globalData.conf.onem2m.ae.id);
//         } else {
//             request_count = 0;
//             globalData.sh_state = ONEM2M_STATE.RETRIVE_CONTAINER;
//             setTimeout(request_oneM2M_setting, 100);
//         }
//     } else {
//         console.log('x-m2m-rsc : ' + status + ' <----');
//         globalData.sh_state =  ONEM2M_STATE.CREATE_AE;
//         setTimeout(request_oneM2M_setting, 1000);
//     }
// }
//
// let retrieve_container_callback = function (status, res_body, count){
//     console.log(res_body);
//     if (status == 2000) {
//         request_count ++;
//         // 아직 container 가 남아 있다면
//         if (request_count <= globalData.conf.onem2m.ae.ctn.length - 1) {
//             globalData.sh_state =  ONEM2M_STATE.RETRIVE_CONTAINER;
//             setTimeout(request_oneM2M_setting, 100);
//         // 마지막 container 까지 다 돌 경우
//         } else {
//             console.log('all container created ');
//
//             // 여기서 이제 다음 처리해야됨 .. 주기적으로 ocf 데이터 조회해서 데이터 전달 하는 로직
//             // 아니면 observe 설정해서 데이터 수신 받을 때마다 oneM2M으로 데이터 전달
//             // EventEmitter
//             ocfClient.init();
//         }
//     } else {
//         console.log('x-m2m-rsc : ' + status + ' <----');
//         globalData.sh_state =  ONEM2M_STATE.CREATE_CONTAINER;
//         setTimeout(request_oneM2M_setting, 100);
//     }
// }
//
// let create_container_callback = function(status, res_body, count) {
//     if (status == 5106 || status == 2001 || status == 4105) {
//         // request_count ++;
//         globalData.sh_state =  ONEM2M_STATE.RETRIVE_CONTAINER;
//         setTimeout(request_oneM2M_setting, 100);
//     } else {
//         console.log('[???} create container error!');
//     }
//
//     // if(conf.cnt.length == 0) {
//     //     callback(2001, count);
//     // }
//     // else {
//     //     if(conf.cnt.hasOwnProperty(count)) {
//     //         let parent = conf.cnt[count].parent;
//     //         let rn = conf.cnt[count].name;
//     //         onem2m_client.create_cnt(parent, rn, count, function (rsc, res_body, count) {
//     //             if (rsc == 5106 || rsc == 2001 || rsc == 4105) {
//     //                 create_cnt_all(++count, function (status, count) {
//     //                     callback(status, count);
//     //                 });
//     //             }
//     //             else {
//     //                 callback(9999, count);
//     //             }
//     //         });
//     //     }
//     //     else {
//     //         callback(2001, count);
//     //     }
//     // }
//
// }
//
//
//
//
// // 1. 디바이스 설정 정보 조회 ( or OCF 디바이스 아이디 조회 및 리소스 조회 )
// // 2. 디바이스 아이디를 통하여 oneM2M 디바이스 조회
// // 3. 없으면 디바이스 생성
//
// // aaaa. ocf discovery 처리 해야됨
// // ocf oic/d, resource 를 찾아서 해당 upstream 및 downstream 설정 과 비교해야함
//
// // 4-1. upstream 데이터 조회 or Observe (OCF - coap 조회 날려서 )
// // 4-2. 조회한 데이터 contentInstance 생성 해서 oneM2M 서버로 전송
//
// // 5-1. 수신 서버 설정 (oneM2M로부터 수신 받을 서버)
// // 5-2. oneM2M notification resource 수신
// // 5-3. OCF data put ?? 또는 특정 제어 전송

