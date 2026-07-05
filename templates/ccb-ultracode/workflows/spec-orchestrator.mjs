export const meta = {
  name: 'spec-orchestrator',
  description: 'specmate 总管 — 拆任务、委派子 Agent、汇报结果',
  phases: [
    { title: 'Route' },
    { title: 'Execute' },
    { title: 'Report' },
  ],
};

const { task } = args;
if (!task) return '❌ missing args.task — 告诉我具体要做什么。';

const t = task.toLowerCase();

phase('Route');

// Route to correct agent
let agentType = 'specmate-dev';
if (/push|commit|git|npm|发布|推送|tag|version/.test(t)) {
  agentType = 'ops-agent';
} else if (/review|审查|检查代码|check|lint/.test(t) && !/fix|修|改|写|实现|加|新|功能|文档|更新/.test(t)) {
  agentType = 'specmate-review';
}

log(`Routing "${task.slice(0, 80)}" → ${agentType}`);

phase('Execute');
const result = await agent(task, { label: agentType === 'ops-agent' ? 'ops' : agentType === 'specmate-review' ? 'review' : 'dev', agentType });

phase('Report');

// If task mentions push/publish, remind to show diff first
if (/push|发布|npm publish|推公开/.test(t)) {
  return `⚠️ ops-agent 执行结果:\n\n${result}\n\n推公开或 npm publish 需要你额外确认。`;
}

return `✅ ${agentType} 完成:\n\n${result}`;
