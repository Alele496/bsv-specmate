export const meta = {
  name: 'spec-orchestrator',
  description: '执行总管 — 收到任务自动路由到 specmate-dev/review/ops',
  phases: [
    { title: 'Route' },
    { title: 'Execute' },
  ],
};

const { task } = args;
if (!task) return '❌ missing args.task';

const t = task.toLowerCase();

phase('Route');

let agentType = 'specmate-dev';
if (/push|commit|git|npm|发布|推送|tag|version/.test(t)) {
  agentType = 'ops-agent';
} else if (/review|审查|检查代码|check|lint|test|验证|测试|verify/.test(t) && !/fix|修|改|写|实现|加|新|功能|文档|更新/.test(t)) {
  agentType = 'specmate-review';
}

log(`Routing → ${agentType}`);

phase('Execute');
const result = await agent(task, { label: agentType === 'ops-agent' ? 'ops' : agentType === 'specmate-review' ? 'review' : 'dev', agentType });

if (/push|发布|npm publish|推公开/.test(t)) {
  return `⚠️ ops-agent:\n\n${result}\n\n推公开或 npm publish 需你额外确认。`;
}

return `${result}`;
