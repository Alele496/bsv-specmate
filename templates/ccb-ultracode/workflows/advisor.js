export const meta = {
  name: 'advisor',
  description: 'specmate 顾问 — 分析讨论 + 确认后交给执行总管',
  phases: [
    { title: 'Analyze' },
    { title: 'Route' },
  ],
};

const { task } = args;
if (!task) return '❌ 跟我说具体想聊什么。';

const t = task.toLowerCase();

phase('Analyze');

// 判断：讨论分析 → 自己回答。动手执行 → 转发给执行总管
const isChat = /怎么|为什么|分析|看看|怎么样|下一步|建议|方向|好不好|行不行|可以吗|现在|什么|现状|数据/.test(t) 
  && !/修|改|写|实现|加|提交|push|commit|推|发布/.test(t);

const isExec = /修|改|写|实现|加|提交|push|commit|推|发布|测试|验证/.test(t);

if (isChat && !isExec) {
  // 纯讨论 — advisor agent 自己回答
  log('分析讨论，不比转发');
  return await agent(task, { label: 'advisor', agentType: 'advisor' });
}

if (isExec && !isChat) {
  // 纯执行 — 直接转发给执行总管
  phase('Route');
  log('转发给执行总管 spec-orchestrator');
  return await agent(task, { label: 'exec', agentType: 'specmate-dev' });
}

// 混合 — 先跟用户确认，然后转发
phase('Route');
log('先分析是否需要动手');
const analysis = await agent(
  `分析这个需求是否应该动手执行还是先讨论:\n${task}\n` +
  `项目的执行总管 spec-orchestrator 负责代码/测试/push。\n` +
  `如果明确是动手任务，回复 "EXEC" + 简短确认。如果是分析讨论，直接给答案。`,
  { label: 'advisor', agentType: 'advisor' }
);

if (analysis.startsWith('EXEC')) {
  return await agent(task, { label: 'exec', agentType: 'specmate-dev' });
}
return analysis;
