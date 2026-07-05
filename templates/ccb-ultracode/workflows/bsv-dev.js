export const meta = {
  name: 'bsv-dev',
  description: 'BSV coding with specmate reviewer — Coder → Review → Fix loop',
  phases: [
    { title: 'Code' },
    { title: 'Review' },
    { title: 'Fix' },
  ],
};

const { task, maxRounds = 2 } = args;

let round = 0;
let code = null;

phase('Code');
code = await agent(
  `Write BSV code for: ${task}. Write all .bsv files and testbenches.`,
  { label: 'coder', agentType: 'bsv-coder' }
);

while (round < maxRounds) {
  phase('Review');
  const review = await agent(
    `Review the BSV code in bsv/ using specmate. Do these steps exactly:
     1. specmate_check(files=[...]) on each .bsv file
     2. For each issue found, call specmate_guide(phase="on_error", input="error code")
     3. For module patterns, call specmate_guide(phase="pattern", input="describe the module")
     4. Report: number of issues found, specific fix instructions for each, code quality score 1-10.
     If no issues found at all, say exactly "No issues". Be brief.`,
    { label: 'reviewer', agentType: 'bsv-reviewer' }
  );

  if (/no issues/i.test(review)) break;

  round++;
  if (round >= maxRounds) {
    phase('Fix');
    code = await agent(
      `Fix these review issues in the BSV code:\n${review}`,
      { label: 'fixer', agentType: 'bsv-coder' }
    );
  }
}

return { code, rounds: round + 1 };
