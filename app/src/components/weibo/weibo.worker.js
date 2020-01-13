import orderBy from 'lodash-es/orderBy';
import timeStringParse from '@48/time-string-parse';

/**
 * 根据时间格式化数据
 * @param rawData
 */
function formatCards(rawData) {
  const fData = rawData.filter((item) => item.card_type === 9);

  for (const item of fData) {
    const time = timeStringParse(item.mblog.created_at);

    item._time = time;
  }

  return orderBy(fData, ['_time'], ['desc']);
}

/**
 * 微博信息轮询查询
 */
let weiboUrl = 'https://m.weibo.cn/api/container/getIndex?type=uid&containerid=';
let containerid = null; // 微博的lfid
let lastId = null; // 记录旧的ID
let timer = null; // 定时器
const t = 1.5 * 60 * (10 ** 3);

/* ajax */
function getData(method, url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.setRequestHeader('MWeibo-Pwa', 1);
    xhr.addEventListener('readystatechange', function(event) {
      if (xhr.status === 200 && xhr.readyState === 4) {
        const res = JSON.parse(xhr.response);

        resolve(res);
      }
    });
    xhr.send();
  }).catch((err) => {
    console.error(err);
  });
}

/* 获取初始ID */
async function initId() {
  try {
    const res = await getData('GET', weiboUrl);
    const cards = formatCards(res.data.cards);

    if (res.ok === 1) {
      for (let i = 0, j = cards.length; i < j; i++) {
        const item = cards[i];

        // 微博，不是关注人，不是置顶
        if (item.card_type === 9 && 'mblog' in item) {
          lastId = Number(item.mblog.id);
          console.log('weibo init', cards, lastId);
          break;
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
}

// 发送数据构建
function formatText(newWeiBo) {
  const sendData = [];

  for (let i = 0, j = newWeiBo.length; i < j; i++) {
    const item = newWeiBo[i];
    const mblog = item.mblog;
    const type = 'retweeted_status' in item.mblog ? '转载' : '原创';

    // pics[].url
    sendData.push({
      data: `${ mblog.user.screen_name } `
        + (mblog.created_at === '刚刚' ? mblog.created_at : ('在' + mblog.created_at))
        + `发送了一条微博：${ mblog.text.replace(/<[^<>]+>/g, '  ') }\n`
        + `类型：${ type }\n`
        + `地址：${ item.scheme }`,
      pics: (mblog.pics || []).map((item) => item.url)
    });
  }

  return sendData;
}

// 轮询
async function polling() {
  try {
    const res = await getData('GET', weiboUrl);

    if (res.ok === 1) {
      const cards = formatCards(res.data.cards);

      console.log('weibo', cards);

      // 循环数据
      const newWeiBo = [];

      for (let i = 0, j = cards.length; i < j; i++) {
        const item = cards[i];

        if (item.card_type === 9 && 'mblog' in item) {
          if (Number(item.mblog.id) > lastId) {
            newWeiBo.push(item);
          } else {
            break;
          }
        }
      }

      // 构建发送数据
      if (newWeiBo.length > 0) {
        lastId = Number(newWeiBo[0].mblog.id);
        const sendData = formatText(newWeiBo);

        postMessage({
          type: 'change',
          data: sendData
        });
      }
    }
  } catch (err) {
    console.error(err);
  }
}

addEventListener('message', async function(event) {
  try {
    const data = event.data;

    if (data.type === 'init') {
      containerid = data.containerid;
      weiboUrl = weiboUrl + containerid;

      // 初始化
      // 开启轮询
      await initId();
      timer = setInterval(polling, t);

      return true;
    }

    // 关闭
    if (data.type === 'cancel') {
      if (timer) {
        clearInterval(timer);
      }

      return true;
    }
  } catch (err) {
    console.error(err);
  }
}, false);