# How we review

Every pull request needs one approving review from a teammate who did not write it, before it is merged. Reviews also show on GitHub who worked on what.

## As the author
1. Work on a branch, open a pull request into `main`, fill in the template.
2. On the right under **Reviewers**, pick a teammate.
3. Wait for the approval. Change things if the reviewer asks, then ask again.
4. Merge only after the approval.

## As the reviewer
1. Open the pull request, read the description.
2. Tab **Files changed**: read through the changes. Unclear lines: click the `+` next to the line and ask a question.
3. Try it: the Vercel preview link in the pull request, or locally with `git switch <branch>` and `npm run dev`.
4. Top right **Review changes**, then:
   - **Approve** when it works and you understand it,
   - **Request changes** when something is wrong, with a sentence why,
   - **Comment** for questions only.

A review takes 10 to 15 minutes. Ask questions; "I don't understand this part" is a good review comment.
