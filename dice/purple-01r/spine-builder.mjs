// The captures already contain 01R rotation, lift and zoom. One visible slot
// replaces each capture atomically, including the final clear result.
// frameTimes, when supplied, is [{id: 'roll_0', time: 0}, ...].
export function buildPurple01RSkeleton(regions, {
  frameTimes,
  landAt = .6,
  settledAt = 35 / 60,
  duration = 19 / 30,
} = {}) {
  if (!Array.isArray(regions) || !regions.length) throw Error('01R 导出缺少贴图区域');
  const attachments = {};
  const names = new Set();
  for (const {id, attachment} of regions) {
    if (typeof id !== 'string' || !id || names.has(id)) throw Error('01R 贴图名称无效或重复');
    if (!attachment || (attachment.type && attachment.type !== 'region')) throw Error('01R 仅使用普通贴图附件');
    names.add(id);
    if (id !== 'anchor') attachments[id] = {...attachment};
  }
  const requireRegion = id => {
    if (!names.has(id)) throw Error('01R 导出缺少贴图：' + id);
    return id;
  };
  requireRegion('anchor');
  const rollFrames = (frameTimes ?? regions
    .filter(({id}) => /^roll_\d+$/.test(id))
    .map(({id}) => ({id, time: Number(id.slice(5)) / 60})))
    .map(({id, time}) => ({time, name: requireRegion(id)}))
    .sort((a, b) => a.time - b.time);
  if (!rollFrames.length || rollFrames[0].time !== 0 || rollFrames[0].name !== 'roll_0') {
    throw Error('01R 转动需要从 roll_0 的第零帧开始');
  }
  for (let i = 0; i < rollFrames.length; i++) {
    const time = rollFrames[i].time;
    if (!Number.isFinite(time) || time < 0 || time >= 32 / 60 || (i && time <= rollFrames[i - 1].time)) {
      throw Error('01R 转动帧时间需要有序且早于结果过渡');
    }
  }
  if (![landAt, settledAt, duration].every(Number.isFinite) ||
      settledAt < 34 / 60 || landAt < settledAt || landAt > duration || settledAt > duration) {
    throw Error('01R 落定时间无效');
  }
  const animations = {};
  for (let point = 1; point <= 6; point++) {
    const result = requireRegion('sz_' + point);
    const timeline = rollFrames.map(frame => ({...frame}));
    timeline.push(
      {time: 32 / 60, name: requireRegion('reveal_' + point + '_0')},
      {time: 33 / 60, name: requireRegion('reveal_' + point + '_1')},
    );
    const lastReveal = 'reveal_' + point + '_2';
    timeline.push({time: 34 / 60, name: names.has(lastReveal) ? lastReveal : result});
    if (settledAt > 34 / 60) timeline.push({time: settledAt, name: result});
    else timeline[timeline.length - 1].name = result;
    if (duration > settledAt) timeline.push({time: duration, name: result});
    animations['spin_' + point] = {
      slots: {result: {attachment: timeline}},
      events: [
        {time: 0, name: 'dice_roll'},
        ...(point === 6 ? [{time: landAt, name: 'sound_ui_dice6'}] : []),
      ],
    };
  }
  for (let point = 1; point <= 6; point++) animations['standby_' + point] = {
    slots: {result: {attachment: [{time: 0, name: 'sz_' + point}]}},
  };
  return {
    skeleton: {
      spine: '4.2.43', x: -100, y: -100, width: 200, height: 200,
      fps: 30, images: 'res/', audio: '',
    },
    bones: [
      {name: 'root'},
      {name: 'all', parent: 'root', scaleX: .95, scaleY: .95},
      {name: 'dice_1', parent: 'all'},
      {name: 'daxiao_1', parent: 'dice_1'},
    ],
    slots: [
      {name: 'anchor', bone: 'root', color: 'ffffff00', attachment: 'anchor'},
      {name: 'result', bone: 'daxiao_1', attachment: 'sz_1'},
    ],
    skins: [{name: 'default', attachments: {
      anchor: {anchor: {type: 'region', path: 'anchor', width: 30, height: 30, scaleX: 6, scaleY: 6}},
      result: attachments,
    }}],
    events: {
      dice_roll: {audio: 'sound/dice_roll.mp3'},
      sound_ui_dice6: {audio: 'sound/sound_ui_dice6.mp3'},
    },
    animations,
  };
}
