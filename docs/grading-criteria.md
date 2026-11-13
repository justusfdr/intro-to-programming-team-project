# Course requirements and grading criteria

Our own summary of the course wiki, so the whole team has it in the repository. The wiki is the source of truth: https://2477-introduction-programming.gitlab.io/wiki/team-project/ (summarised on 12 Nov 2026; check the wiki for changes).

## Facts
- The team project is 40% of the final grade. All members get the same grade.
- Deadline: link to the public GitHub repository on Moodle by 23 Nov 2026, 23:59. Only one member submits. Commits after the deadline do not count.
- The repository must be public, contain the deployed app's code on `main`, and have a `README.md` with the deployed URL, names and student numbers of all members, and the commands to run the app and its tests.
- Teams of 3 to 4; every member must contribute code.
- Presentation in week 11 or 12: a live demo of the app at its deployed URL (no slides or videos instead), then a repository walkthrough where the teaching staff asks any member high-level questions about how the project is built (for example: where is the data stored, what do the tests cover and not cover, what happens if an external API is down).

## Grading criteria
Each criterion is scored Low (30%), Mid (70%) or High (100%) of its weight.

| # | Criterion | Weight | What "High" needs |
|---|-----------|--------|-------------------|
| 1 | It works | 20% | The deployed app runs all workflows without errors, including invalid input. |
| 2 | User interface and experience | 20% | The interface fits the problem; workflows are direct; results and errors are clearly shown. |
| 3 | Scope and ambition | 20% | Substantial features that go well beyond a solo project, implemented consistently. |
| 4 | Verification | 10% | Tests cover accepted and rejected actions and edge cases, and all pass on `main`. |
| 5 | Security | 10% | Access control and input validation are enforced; dependencies are minimal, pinned and without known vulnerabilities; no credentials in the repository. |
| 6 | Repository walkthrough | 20% | Members explain how the project is built, why, what its limits are and how it could change. |

## What this means for us
- Everyone must understand the whole project, not only their own part.
- Keep the deployed app working on `main` and keep all tests passing there.
- Never commit keys or passwords (`.env.local` stays out of the repository).
