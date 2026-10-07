'use strict';
(() => {
  const home = ['聊聊学习', '听点音乐', '聊聊日常', '讲个笑话'];
  const subjects = {
    japanese: { match: /日语|日本語|japanese|五十音/, title: '日语', plan: '可以先用五分钟复习假名，再跟读两三句。要试着写一句日语吗？', question: '试着用日语说「我每天学习日语」。你可以直接输入答案。', answer: '毎日、日本語を勉強します。这里的「毎日」是每天，「勉強します」是学习。', correct: value => /毎日.*日本語.*勉強します/.test(value) },
    c: { match: /c\s*语言|编程|代码|\bc\b|vim|vscode/i, title: 'C 语言', plan: '先写一个能运行的小程序，再改一个变量观察输出。比起一次记很多语法，这样更容易知道每一步在做什么。要试一道小题吗？', question: '小题：int x = 3; x += 2; 最后 x 的值是多少？', answer: '是 5。x += 2 相当于 x = x + 2。', correct: value => /^5[。.!！\s]*$/.test(value) },
    math: { match: /数学|集合|离散|math/, title: '集合', plan: '可以先区分「元素属于集合」和「集合包含子集」，再用两个很小的集合练习交集、并集。要试一道交集题吗？', question: 'A = {1, 2}，B = {2, 3}。A 和 B 的交集是什么？', answer: '是 {2}。交集只保留两个集合都含有的元素。', correct: value => /^[{｛]?\s*2\s*[}｝]?[。.!！\s]*$/.test(value) },
    network: { match: /网络|以太网|局域网|network|lan\b/i, title: '网络', plan: '可以先弄清局域网和互联网的区别，再看设备如何连接。先把一个概念讲清楚，比背一串缩写更有用。要试一道判断题吗？', question: '两台电脑连在同一个局域网里，就一定能访问互联网吗？', answer: '不一定。局域网可以独立存在；访问互联网还需要可用的网络出口等条件。', correct: value => /不一定|不能|不对|不可以|^否$/.test(value) },
    software: { match: /软件工程|测试|需求|边界值/, title: '软件工程', plan: '可以沿着「需要做什么、怎样设计、怎样测试」梳理一个小功能，再为它列出边界情况。要试一道边界值题吗？', question: '一个输入只接受 1 到 100 的整数。边界附近可以选哪四个值来测试？', answer: '可以选 0、1、100、101，分别覆盖下界外、下界、上界和上界外。', correct: value => [0, 1, 100, 101].every(n => (value.match(/\d+/g) || []).map(Number).includes(n)) }
  };
  function createConversation() {
    let topic = '', pending = '', subject = '', nickname = '';
    const counts = new Map();
    const pick = (key, variants) => { const n = counts.get(key) || 0; counts.set(key, n + 1); return variants[n % variants.length]; };
    const result = (text, suggestions = home) => ({ text, suggestions });
    const studyChoices = ['日语', 'C 语言', '数学', '今天的文章'];
    function reply(value, context = {}) {
      const original = String(value).trim().slice(0, 320);
      const text = original.toLowerCase();
      if (!text) return result('想聊什么，直接说就好。');
      if (/^(重新聊|清空对话|重新开始)$/.test(text)) { reset(); return result('好，我们重新聊。今天怎么样？'); }
      if (/我叫什么|我的名字|记得我吗/.test(text)) return result(nickname ? `你刚才让我叫你${nickname}。` : '还没告诉我怎么称呼你。想让我叫你什么？');
      const name = original.match(/^(?:请|你可以)?叫我\s*([\p{L}\p{N}_· -]{1,12})[。！!]?$/u) || original.match(/^我叫\s*([\p{L}\p{N}_· -]{1,12})[。！!]?$/u);
      if (name) { nickname = name[1].trim(); return result(`好，${nickname}。今天想聊什么？`); }
      if (/你.*(名字|叫什么|是谁)|^名字$|name|who are you/.test(text)) return result('我是 KGY。可以陪你聊天，也可以一起看这里的文章。');
      if (/换个话题|聊点别的/.test(text)) { pending = ''; topic = ''; return result('好，换个话题。想聊学习、音乐，还是最近的生活？'); }
      if (/再见|晚安|bye|good night|おやすみ/.test(text)) { pending = ''; return result('好，早点休息。下次见。'); }
      if (/^(你好|您好|嗨|hello|hi|早上好|晚上好|こんにちは)[呀啊~～!！。\s]*$/i.test(text)) return result(pick('hello', ['你好，今天过得怎么样？', '在呢。最近有什么想聊的？', nickname ? `你好，${nickname}。今天想做点什么？` : '你好。想随便聊聊，还是一起学点东西？']));
      if (/谢谢|感谢|thank|ありがとう/.test(text)) return result(pick('thanks', ['不客气。还想聊什么？', '能帮上忙就好。要接着聊吗？']), ['接着聊', '换个话题']);
      if (/笑话|逗我|joke/.test(text) || (topic === 'joke' && /换一个|再来|继续|接着/.test(text))) {
        topic = 'joke'; pending = '';
        return result(pick('joke', ['为什么程序员分不清万圣节和圣诞节？因为 OCT 31 = DEC 25。这里是八进制 31 和十进制 25。', '我给待办清单增加了「整理待办清单」。现在清单更长了，事情也确实做了一件。', '闹钟问我为什么总按稍后提醒。我说：因为我很尊重你的重复劳动。']), ['再来一个', '聊聊学习', '听点音乐', '换个话题']);
      }
      if (/几点|星期几|今天几号|现在时间/.test(text)) {
        const date = context.now || new Date();
        return result(`按你设备上的时间，现在是 ${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)}。`);
      }
      if (/天气|下雨|下雪|气温/.test(text)) return result('我看不到实时天气。你那里今天是什么天气？可以聊聊想出门还是待在家里。', ['待在家里', '想出门', '聊聊旅行', '换个话题']);
      if (/没睡好|睡眠不够|熬夜/.test(text) && topic === 'mood') { pending = ''; return result('那今天先把最必要的一件事做完，剩下的可以往后放。你想安静休息一下，还是换个轻松话题？', ['听点音乐', '讲个笑话', '想说说原因', '换个话题']); }
      if (/事情太多|任务太多|忙不过来/.test(text) && topic === 'mood') { pending = ''; return result('可以先列三件事，只挑最急的一件。你愿意说说现在最让你烦的是哪一件吗？', ['想说说原因', '安排学习', '讲个笑话', '换个话题']); }
      if (/累|难过|心情不好|烦|疲|sad|tired|不开心/.test(text)) {
        topic = 'mood'; pending = 'mood';
        return result(pick('mood', ['听起来今天不太轻松。是没睡好，还是事情比较多？', '先不用急着调整心情。想说说发生了什么，还是聊点别的？']), ['没睡好', '事情太多', '想说说原因', '换个话题']);
      }
      if (/无聊|bored|不知道聊什么/.test(text)) { topic = 'daily'; pending = ''; return result('可以来道小题、听首歌，或者聊聊最近看的东西。你现在更想动动脑子，还是放松一下？', ['来个练习', '听点音乐', '讲个笑话', '聊聊游戏']); }
      // Resolve answers before their words accidentally select a new topic.
      if (pending === 'answer' && subject && subjects[subject].correct(original)) {
        pending = ''; return result(`对。${subjects[subject].answer}`, ['再解释一下', '安排学习', '换个话题']);
      }
      if (topic === 'music' && /^(学习时|休息时)$/.test(text)) return result(/学习时/.test(text) ? '那就选不太抢注意力的，或者先试试不放音乐。哪一种更能让你进入状态，就用哪一种。' : '休息时就按心情选。最近有没有一首你会反复听的歌？', ['聊聊学习', '聊聊日常', '换个话题']);
      if (pending === 'book' && /^(小说|知识类|暂时没读)$/.test(text)) { pending = ''; return result('可以先从一个短篇或一章开始。先找到让你想继续读的内容。你更在意故事，还是里面的观点？', ['故事', '观点', '换个话题']); }
      if (topic === 'book' && /^(故事|观点)$/.test(text)) return result(/故事/.test(text) ? '那就留意哪个情节让你想往下读。试着用两句话讲给别人听，也能看看自己抓住了哪些重点。' : '可以把最有意思的观点记下来，再想一个支持它或反驳它的例子。', ['聊聊电影', '换个话题']);
      if (topic === 'movie' && /^(角色|情节|画面氛围)$/.test(text)) return result('可以挑一段印象最深的场景，说说它为什么吸引你。和别人讨论时，从一个具体片段聊起更容易接上。', ['聊聊书', '换个话题']);
      if (topic === 'game' && /^(想放松|喜欢挑战)$/.test(text)) return result(/放松/.test(text) ? '可以选一个不赶任务、随时能停的游戏。玩到舒服就好，不用把休息也变成打卡。' : '可以给自己设一个小目标，卡住了就休息一下。你喜欢研究玩法，还是练习操作？', ['聊聊日常', '换个话题']);
      if (topic === 'food' && /^(自己做|出去吃)$/.test(text)) return result(/自己/.test(text) ? '先看看手头有什么食材，做一道熟悉的简单菜就好。你冰箱里现在有什么？' : '可以先定一个步行范围，再选一家熟悉的店。具体营业时间和价格我无法实时查询。', ['聊聊日常', '换个话题']);
      const chosen = Object.entries(subjects).find(([, item]) => item.match.test(text));
      if (chosen && !/答案|为什么|解释/.test(text)) {
        [subject] = chosen; topic = 'study'; pending = 'practice-offer';
        return result(chosen[1].plan, ['来个练习', '安排学习', '今天的文章', '换个话题']);
      }
      if (/文章|读什么|笔记/.test(text)) { topic = 'study'; pending = ''; return result(context.title ? `现在可以从《${context.title}》开始。读一个小节后，试着用自己的话总结两句。` : '可以去文章列表里选一个感兴趣的主题。读完一个小节，再回想它在解决什么问题。', ['聊聊学习', '安排学习', '来个练习', '换个话题']); }
      if (/学习|学什么|安排|计划|study|learn|勉強/.test(text)) {
        topic = 'study'; pending = 'subject';
        return result(pick('study', ['先选一个小主题。今天想学日语、C 语言，还是数学？', '可以按二十分钟安排：五分钟复习、十分钟练习、五分钟回顾。今天想练哪一科？']), studyChoices);
      }
      if (/练习|出题|考考|试一道/.test(text) || (topic === 'study' && /^(好|可以|要|继续|接着聊|试试)[的啊呀。！!\s]*$/.test(text))) {
        topic = 'study';
        if (!subject) { pending = 'subject'; return result('可以。先选一科，我给你一道小题。', studyChoices); }
        pending = 'answer'; return result(subjects[subject].question, ['给我答案', '再解释一下', '换个话题']);
      }
      if (topic === 'study' && subject && /答案|为什么|解释|提示|看不懂/.test(text)) {
        pending = '';
        return result(subjects[subject].answer, ['再练一次', '安排学习', '今天的文章', '换个话题']);
      }
      if (topic === 'study' && subject && /再练一次/.test(text)) { pending = 'answer'; return result(subjects[subject].question, ['给我答案', '再解释一下', '换个话题']); }
      if (/音乐|歌曲|听歌|music|song/.test(text)) {
        topic = 'music'; pending = 'music';
        const names = (context.tracks || []).slice(0, 3).map(track => track.name).filter(Boolean);
        return result(names.length ? `播放器里有 ${names.map(title => `《${title}》`).join('、')}。你喜欢安静一点的，还是更有节奏的？` : '你喜欢安静一点的音乐，还是更有节奏的？下面的「打开音乐」可以展开歌单。', ['安静一点', '有点节奏', '正在听什么', '换个话题']);
      }
      if (topic === 'music' && /正在听|当前.*歌/.test(text)) return result(context.currentTrack ? `播放器当前选中的是《${context.currentTrack}》。` : '播放器还没显示当前歌曲。可以打开歌单选一首。', ['安静一点', '有点节奏', '换个话题']);
      if (topic === 'music' && /安静|节奏|流行|摇滚|纯音乐|随便/.test(text)) { pending = ''; return result('可以先在歌单里试听一首，音量放到舒服的位置。你通常是在学习时听，还是休息时听？', ['学习时', '休息时', '换个话题']); }
      const hobbies = [
        ['book', /书|小说|阅读|book/, '最近在读什么？你更喜欢小说，还是知识类的书？', ['小说', '知识类', '暂时没读', '换个话题']],
        ['movie', /电影|动画|动漫|movie|anime/, '最近看了什么？想聊轻松一点的故事，还是悬疑、科幻？', ['轻松一点', '悬疑', '科幻', '换个话题']],
        ['game', /游戏|game/, '你平时更喜欢单机游戏，还是和朋友一起玩？', ['单机', '和朋友玩', '轻松一点', '换个话题']],
        ['travel', /旅行|旅游|出门|travel/, '想去城市里走走，还是看海、去山里？先选一种感觉，再想具体地点。', ['城市散步', '看海', '山里走走', '换个话题']],
        ['food', /吃什么|吃饭|早餐|午餐|晚餐|美食|饿/, '先解决这一顿。想吃清淡一点的，还是有味道一点的？', ['清淡一点', '有味道一点', '随便推荐', '换个话题']]
      ];
      const hobby = hobbies.find(([, match]) => match.test(text));
      if (hobby) { topic = hobby[0]; pending = topic; return result(hobby[2], hobby[3]); }
      if (/周末|日常|生活|今天怎么样|最近怎么样/.test(text)) { topic = 'daily'; pending = 'daily'; return result('最近有什么小事让你觉得还不错？也可以聊聊周末想怎么过。', ['想休息', '想出门', '聊聊游戏', '聊聊学习']); }
      if (/可爱|喜欢你|漂亮|cute/.test(text)) return result('谢谢。你想继续聊刚才的事，还是换个话题？', ['接着聊', '换个话题']);
      if (pending === 'answer' && subject) {
        if (subjects[subject].correct(original)) { pending = ''; return result(`对。${subjects[subject].answer}`, ['再解释一下', '安排学习', '换个话题']); }
        return result('还差一点。要看看答案，再对照一下吗？', ['给我答案', '再解释一下', '换个话题']);
      }
      if (pending === 'mood' || (topic === 'mood' && /想说说原因|继续|接着/.test(text))) { pending = ''; return result('可以，我听着。先说最让你在意的那件事，不用一次把所有事情都讲清楚。', ['事情太多', '没睡好', '换个话题']); }
      if (pending === 'book') { pending = ''; return result('可以先从一个短篇或一章开始。比起一定要读完，先找到让你想继续读的内容更有意思。你更在意故事，还是里面的观点？', ['故事', '观点', '换个话题']); }
      if (pending === 'movie') { pending = ''; return result('可以从这种类型里选一部时间合适的。你更在意角色、情节，还是画面和氛围？', ['角色', '情节', '画面氛围', '换个话题']); }
      if (pending === 'game') { pending = ''; return result('那就按今天的时间选。只想玩一小会儿的话，可以挑能随时停下来的。最近有什么游戏让你印象比较深？', ['想放松', '喜欢挑战', '换个话题']); }
      if (pending === 'travel') { pending = ''; return result('可以每天只安排一项主要活动，留一点随便走走的时间。你更想聊行程节奏，还是先列一个预算范围？', ['行程节奏', '预算范围', '换个话题']); }
      if (topic === 'travel' && /行程|节奏/.test(text)) return result('先确定最想去的一处，其余留作可选。交通和吃饭也要占时间，别把每天排得太满。', ['预算范围', '换个话题']);
      if (topic === 'travel' && /预算/.test(text)) return result('可以先分成往返交通、住宿、吃饭、市内交通和门票。具体价格我无法实时查询，确定日期后再逐项核对。', ['行程节奏', '换个话题']);
      if (pending === 'food') { pending = ''; return result(/清淡/.test(text) ? '可以考虑粥、汤面或一份简单饭菜。先吃到舒服就好。' : '可以考虑炒饭、拌面，或者你平时喜欢的一道菜。你现在想自己做，还是出去吃？', ['自己做', '出去吃', '换个话题']); }
      if (pending === 'daily' || /想休息|待在家里/.test(text)) { pending = ''; return result('那就给自己留一段不用赶进度的时间。听歌、读几页书，或者单纯歇一会儿都可以。', ['听点音乐', '聊聊书', '讲个笑话', '换个话题']); }
      if (/继续|接着聊|说简单点|举个例子/.test(text)) return result('想接着聊刚才的哪一部分？补一个小问题，我更容易接上。', topic === 'study' ? studyChoices : home);
      return result(pick('unknown', ['这句我还没接上。你想聊它的哪一部分？也可以开启上面的免费 AI 聊天。', '能再补一句背景吗？简短对话会比较有限，开启 AI 后可以聊更自由的话题。']), home);
    }
    function reset() { topic = ''; pending = ''; subject = ''; nickname = ''; counts.clear(); }
    return { reply, reset, greeting: () => result('你好，我是 KGY。今天想聊什么？') };
  }
  const api = { createConversation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.KgyDialogue = api;
})();
