const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const changes = await git.diff({ staged: true });

// Provide a placeholder or appropriate value for the third argument (e.g., an empty string or object)
def("CODE_CHANGES", changes);

$`## Role
You are a senior developer whose job is to review code changes and provide meaningful feedback.

## Task
Review <CODE_CHANGES>, point out possible mistakes or bad practices, and provide suggestions for improvement.
- Be specific about what's wrong and why it's wrong
- Reference proper coding standards and best practices
- Be brief to get your point across
`;