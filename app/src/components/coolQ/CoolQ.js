import { message } from 'antd';
import { requestRoomMessage, requestUserInformation } from '../kd48listerer/roomListener';
import { templateReplace } from '../../utils';
import { chouka } from '../chouka/chouka';
import * as storagecard from '../chouka/storagecard';
import bestCards from '../chouka/bestCards';

class CoolQ{
  time: number;
  qq: string;
  port: string;
  isError: boolean;
  eventUrl: string;
  eventSocket: ?WebSocket;
  isEventSuccess: boolean;
  apiUrl: string;
  apiSocket: ?WebSocket;
  isApiSuccess: boolean;
  callback: ?Function;

  option: ?Object;
  modianTitle: ?string;
  modianGoal: ?string;
  modianWorker: ?Worker;
  choukaJson: ?Object;
  bukaQQNumber: ?Array;
  members: ?RegExp;
  memberId: ?Array;
  roomListenerTimer: ?number;
  roomLastTime: ?number;
  kouDai48Token: ?string;
  weiboWorker: ?Worker;
  timingMessagePushTimer: ?Object;

  handleOpenEventSocket: Function;
  handleEventSocketError: Function;
  handleListenerEventMessage: Function;
  handleOpenApiSocket: Function;
  handleApiSocketError: Function;
  handleListenerApiMessage: Function;

  constructor(qq: string, port: string, callback: Function): void{
    this.time = null;                                         // 登录时间戳
    this.qq = qq;                                             // qq号
    this.port = port;                                         // socket端口
    this.isError = false;                                     // 判断是否错误
    this.eventUrl = `ws://127.0.0.1:${ this.port }/event/`;   // 地址
    this.eventSocket = null;                                  // socket
    this.isEventSuccess = false;                              // 判断是否连接成功
    this.apiUrl = `ws://127.0.0.1:${ this.port }/api/`;       // 地址
    this.apiSocket = null;                                    // socket
    this.isApiSuccess = false;                                // 判断是否连接成功
    this.callback = callback;                                 // 获得信息后的回调

    this.option = null;                  // 配置
    // 摩点项目相关
    this.modianTitle = null;             // 摩点项目标题
    this.modianGoal = null;              // 摩点项目目标
    this.modianWorker = null;            // 摩点新线程
    this.choukaJson = null;              // 抽卡配置
    this.bukaQQNumber = null;            // 允许群里补卡的qq号
    // 口袋48监听相关
    this.members = null;                 // 监听指定成员
    this.memberId = null;                // 坚听成员id
    // 房间信息监听相关
    this.roomListenerTimer = null;       // 轮询定时器
    this.roomLastTime = null;            // 最后一次发言
    this.kouDai48Token = null;           // token
    // 微博监听相关
    this.weiboWorker = null;             // 微博监听新线程
    // 群内定时消息推送
    this.timingMessagePushTimer = null;  // 群内定时消息推送定时器

    this.handleOpenEventSocket = this._handleOpenSocket.bind(this, 'isEventSuccess', 'event');
    this.handleEventSocketError = this._handleSocketError.bind(this, 'event');
    this.handleListenerEventMessage = this._handleListenerMessage.bind(this, 'event');
    this.handleOpenApiSocket = this._handleOpenSocket.bind(this, 'isApiSuccess', 'api');
    this.handleApiSocketError = this._handleSocketError.bind(this, 'api');
    this.handleListenerApiMessage = this._handleListenerMessage.bind(this, 'api');
  }
  // 初始化连接
  _handleOpenSocket(key: string, type: string, event: Event): void{
    this[key] = true;
    message.success(`【${ this.qq }】 Socket: ${ type }连接成功！`);
  }
  // 连接失败
  _handleSocketError(type: string, event: Event): void{
    this.isError = true;
    message.error(`【${ this.qq }】 Socket: ${ type }连接失败！请检查酷Q的配置是否正确！`);
  }
  // 接收消息
  _handleListenerMessage(type: string, event: Event): void{
    const dataJson: Object = JSON.parse(event.data);
    const gn: number = Number(this.option.groupNumber);
    console.log(dataJson);

    // 群消息
    if(type === 'event' && 'group_id' in dataJson && dataJson.group_id === gn && dataJson.self_id === Number(this.qq)){
      // 群聊天
      if(dataJson.message_type === 'group'){
        this.callback(dataJson, this);
      }
      // 新成员加入群
      if(
        (dataJson.post_type === 'notice' || dataJson.post_type === 'event')
        && (dataJson.notice_type === 'group_increase' || dataJson.event === 'group_increase')
        && this.option.basic.isNewGroupMember
      ){
        this.getGroupMemberInfo(dataJson);
      }
    }
    // 群名片
    if('data' in dataJson && 'nickname' in dataJson.data && 'group_id' in dataJson.data && dataJson.data.group_id === gn){
      const { nickname, user_id }: { nickname: string, user_id: number } = dataJson.data;

      this.sendMessage(templateReplace(this.option.basic.welcomeNewGroupMember, {
        nickname,
        userid: user_id
      }));
    }
  }
  // 发送信息
  sendMessage(message: string): void{
    this.apiSocket.send(JSON.stringify({
      action: 'send_group_msg',
      params: {
        group_id: Number(this.option.groupNumber),
        message
      }
    }));
  }
  // 查找群成员的名片
  getGroupMemberInfo(dataJson: Object): void{
    const userId: number = dataJson.user_id;

    this.apiSocket.send(JSON.stringify({
      action: 'get_group_member_info',
      params: {
        group_id: Number(this.option.groupNumber),
        user_id: userId,
        type: 'group_member_info'
      }
    }));
  }
  // 初始化
  init(): void{
    // event
    this.eventSocket = new WebSocket(this.eventUrl);
    this.eventSocket.addEventListener('open', this.handleOpenEventSocket, false);
    this.eventSocket.addEventListener('error', this.handleEventSocketError, false);
    this.eventSocket.addEventListener('message', this.handleListenerEventMessage, false);
    // api
    this.apiSocket = new WebSocket(this.apiUrl);
    this.apiSocket.addEventListener('open', this.handleOpenApiSocket, false);
    this.apiSocket.addEventListener('error', this.handleApiSocketError, false);
    this.apiSocket.addEventListener('message', this.handleListenerApiMessage, false);
  }
  // 退出
  outAndClear(): void{
    // 删除摩点的web worker
    if(this.modianWorker){
      this.modianWorker.postMessage({
        type: 'cancel'
      });
      this.modianWorker.terminate();
      this.modianWorker = null;
    }

    // 关闭房间信息监听
    if(this.roomListenerTimer !== null){
      global.clearTimeout(this.roomListenerTimer);
    }

    // 删除微博的web worker
    if(this.weiboWorker){
      this.weiboWorker.postMessage({
        type: 'cancel'
      });
      this.weiboWorker.terminate();
      this.weiboWorker = null;
    }

    // 删除群消息推送定时器
    if(this.timingMessagePushTimer){
      this.timingMessagePushTimer.cancel();
    }

    // --- 关闭socket ---
    // event
    this.eventSocket.removeEventListener('open', this.handleOpenEventSocket);
    this.eventSocket.removeEventListener('error', this.handleEventSocketError);
    this.eventSocket.removeEventListener('message', this.handleListenerEventMessage);
    // api
    this.apiSocket.removeEventListener('open', this.handleOpenApiSocket);
    this.apiSocket.removeEventListener('error', this.handleApiSocketError);
    this.apiSocket.removeEventListener('message', this.handleListenerApiMessage);

    this.eventSocket.close();
    this.apiSocket.close();
  }

  /* === 从此往下是业务相关 === */

  // web worker监听到摩点的返回信息
  async listenModianWorkerCbInformation(event: Event): Promise<void>{
    if(event.data.type === 'change'){
      try{
        const { data, alreadyRaised, backerCount, endTime, timedifference }: {
          data: Array,
          alreadyRaised: string,
          backerCount: number,
          endTime: string,
          timedifference: string
        } = event.data;
        const { modianTemplate, isChouka, isChoukaSendImage }: {
          modianTemplate: string,
          isChouka: boolean,
          isChoukaSendImage: boolean
        } = this.option.basic;
        const amountDifference: number = (Number(this.modianGoal) - Number(alreadyRaised)).toFixed(2);
        const { cards, money, multiple, db }: {
          cards: Array,
          money: number,
          multiple: number,
          db: Object
        } = this.choukaJson || {};

        // 倒序发送消息
        for(let i: number = data.length - 1; i >= 0; i--){
          const item: Object = data[i];

          // 抽卡
          const choukaStr: string[] = [];
          let cqImage: string = '';

          if(isChouka){
            // 把卡存入数据库
            const kaResult: [] = await storagecard.query(db, item.userid);
            const record: Object = kaResult.length === 0 ? {} : JSON.parse(kaResult[0].record);

            const choukaResult: Object = chouka(cards, money, Number(item.pay_amount), multiple);
            let len: number = 0;  // 输出卡牌数量

            for(const key: string in choukaResult){
              const item2: Object = choukaResult[key];
              const str: string = `【${ item2.level }】${ item2.name } * ${ item2.length }`;
              choukaStr.push(str);

              if(item2.id in record){
                record[item2.id] += item2.length;
              }else{
                record[item2.id] = item2.length;
              }

              len += 1;
            }

            if(isChoukaSendImage){
              cqImage = bestCards(choukaResult, 2);
            }

            // 把卡存入数据库
            if(kaResult.length === 0) await storagecard.insert(db, item.userid, item.nickname, record);
            else await storagecard.update(db, item.userid, item.nickname, record);
          }

          const msg: string = templateReplace(modianTemplate, {
            id: item.nickname,
            money: item.pay_amount,
            modianname: this.modianTitle,
            modianid: this.option.basic.modianId,
            goal: this.modianGoal,
            alreadyraised: alreadyRaised,
            backercount: backerCount,
            amountdifference: amountDifference,
            endtime: endTime,
            timedifference,
            chouka: `${ choukaStr.join('\n') }${ cqImage }`
          });

          await this.sendMessage(msg);
        }
      }catch(err){
        console.error(err);
      }
    }
  }
  // 监听信息
  async listenRoomMessage(): Promise<void>{
    const basic: Object = this.option.basic;
    const times: number = basic.liveListeningInterval ? (basic.liveListeningInterval * 1000) : 15000;

    try{
      const data2: Object = await requestRoomMessage(this.option.basic.roomId, this.kouDai48Token);
      if(!(data2.status === 200 && 'content' in data2)){
        this.roomListenerTimer = global.setTimeout(this.listenRoomMessage.bind(this), times);
        return;
      }
      const newTime: number = data2.content.data[0].msgTime;
      // 新时间大于旧时间，获取25条数据
      if(!(newTime > this.roomLastTime)){
        this.roomListenerTimer = global.setTimeout(this.listenRoomMessage.bind(this), times);
        return;
      }
      const data3: Object = await requestRoomMessage(this.option.basic.roomId, this.kouDai48Token, 25);  // 重新获取数据
      if(!(data3.status === 200 && 'content' in data3)){
        this.roomListenerTimer = global.setTimeout(this.listenRoomMessage.bind(this), times);
        return;
      }
      // 格式化发送消息
      const sendStr: string[] = [];
      const data: Array = data3.content.data;
      for(let i: number = 0, j: number = data.length; i < j; i++){
        const item: Object = data[i];
        if(item.msgTime > this.roomLastTime){
          const extInfo: Object = JSON.parse(item.extInfo);
          switch(extInfo.messageObject){
            // 普通信息
            case 'text':
              sendStr.push(`${ extInfo.senderName }：${ extInfo.text }\n`
                         + `时间：${ item.msgTimeStr }`);
              break;
            // 翻牌信息
            case 'faipaiText':
              const ui: Object = await requestUserInformation(extInfo.faipaiUserId);
              sendStr.push(`${ ui.content.userInfo.nickName }：${ extInfo.faipaiContent }\n`
                         + `${ extInfo.senderName }：${ extInfo.messageText }\n`
                         + `时间：${ item.msgTimeStr }`);
              break;
            // 发送图片
            case 'image':
              const url: string = JSON.parse(item.bodys).url;
              let txt: string = `${ extInfo.senderName }：`;
              if(this.option.basic.isRoomSendImage) txt += `\n[CQ:image,file=${ url }]\n`;
              txt += `${ url }\n`;
              sendStr.push(`${ txt }时间：${ item.msgTimeStr }`);
              break;
            // 发送语音
            case 'audio':
              const url2: string = JSON.parse(item.bodys).url;
              sendStr.push(`${ extInfo.senderName } 发送了一条语音：${ url2 }\n`
                         + `时间：${ item.msgTimeStr }`);
              break;
            // 发送短视频
            case 'videoRecord':
              const url3: string = JSON.parse(item.bodys).url;
              sendStr.push(`${ extInfo.senderName } 发送了一个视频：${ url3 }\n`
                         + `时间：${ item.msgTimeStr }`);
              break;
            // 直播
            case 'live':
              sendStr.push(`${ extInfo.senderName } 正在直播\n`
                         + `直播间：${ extInfo.referenceTitle }\n`
                         + `直播标题：${ extInfo.referenceContent }\n`
                         + `时间：${ item.msgTimeStr }`);
              break;
            // 花50个鸡腿的翻牌？不清楚是什么新功能，暂时先提示这么多
            case 'idolFlip':
              sendStr.push(`${ extInfo.senderName } 翻牌了 ${ extInfo.idolFlipUserName }的问题：\n`
                         + `${ extInfo.idolFlipContent }\n`
                         + `时间：${ item.msgTimeStr }`);
              break;
          }
        }else{
          break;
        }
      }
      // 倒序数组发送消息
      for(let i: number = sendStr.length - 1; i >= 0; i--){
        await this.sendMessage(sendStr[i]);
      }
      // 更新时间节点
      this.roomLastTime = data[0].msgTime;
    }catch(err){
      console.error(err);
    }
    this.roomListenerTimer = global.setTimeout(this.listenRoomMessage.bind(this), times);
  }
  // web worker监听到微博的返回信息
  async listenWeiboWorkerCbInformation(event: Event): Promise<void>{
    const { isWeiboAtAll }: { isWeiboAtAll: boolean } = this.option.basic;

    if(event.data.type === 'change'){
      try{
        const { data }: { data: Array } = event.data;
        // 倒序发送消息
        for(let i: number = data.length - 1; i >= 0; i--){
          let item: string = data[i];

          // @所有人的功能
          if(isWeiboAtAll) item = `[CQ:at,qq=all] ${ item }`;

          await this.sendMessage(item);
        }
      }catch(err){
        console.error(err);
      }
    }
  }
  // 群内定时推送消息
  async timingMessagePush(msg: string): Promise<void>{
    try{
      await this.sendMessage(msg);
    }catch(err){
      console.error(err);
    }
  }
}

export default CoolQ;