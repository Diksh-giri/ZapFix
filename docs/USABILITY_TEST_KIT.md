# ZapFix usability test kit

This kit prepares a moderated usability session for ZapFix's guarded workflow-recovery experience. It is intended to test whether invited participants can understand a supported workflow failure, evaluate a proposed repair, make an informed approval decision, retry the failed step, and understand restoration. Creating this kit does not mean a usability session has occurred or that any product target has been met.

## Study purpose

The session evaluates the product assumptions and targets in the PRD. It should answer whether participants can:

- Identify the failed workflow step and explain the likely cause.
- Distinguish system-confirmed evidence from AI-generated interpretation.
- Understand the current and proposed configuration values.
- Recognize uncertainty and that a recommendation may be incorrect.
- Approve or reject a proposed change deliberately.
- Verify the result after retrying the failed step.
- Understand what Restore changes and what it does not undo.

The session tests the product, not the participant. The moderator must not teach the interface or steer the participant toward approval.

## Participant profile

Recruit people who resemble the PRD's primary users:

- Non-technical professionals or small-team operators who create, maintain, or depend on automated workflows.
- People who are comfortable using web applications but do not need experience with APIs, authentication, field mappings, or software debugging.
- People who can describe at least one automated or repeatable business process they use or support.

Avoid recruiting only developers or automation specialists. Their familiarity with technical errors could hide problems experienced by the intended audience. Record relevant experience in the pre-session questions so results can be interpreted by participant background.

Use a small tester group for the initial study. Do not claim statistical significance from this qualitative sample.

## Session prerequisites

Complete these checks before inviting a participant:

- Use only accounts, calendars, and workflow data approved for testing.
- Never use a participant's production workflow or customer data.
- Prepare one supported, deliberately broken workflow with one trigger and one action.
- Verify that the selected scenario can reach failure, diagnosis, proposal, approval, retry, and restore states.
- Confirm the workflow starts from the same configuration for each participant.
- Confirm the participant has an active invited ZapFix account.
- Confirm the required Google test connection is active. Schedule the session within days of connecting because Google test connections last about seven days.
- Verify the moderator can restore or reset the scenario between sessions.
- Prepare a backup fixture-based session if the live test integration is unavailable. Tell the participant when integration behavior is simulated.
- Open the observer scorecard before the session and assign one timekeeper when a separate observer is available.

Do not run a session until the complete scenario has passed an internal smoke test. If the product cannot safely reach the approval, retry, or restore state, reschedule rather than improvising around a broken flow.

## Safety briefing

Read this before the participant begins:

> You are testing ZapFix, and we are testing the product—not you. This session uses a test workflow and test account. ZapFix may show an AI-generated explanation and a proposed change. The recommendation may be incorrect. No workflow setting should change unless you explicitly confirm it. You may reject the recommendation or leave the troubleshooting flow at any time. Please think aloud as you work, and tell us what you expect before selecting an action.

Confirm that the participant understands:

- The scenario uses test data and a test integration.
- AI-generated text is not guaranteed to be correct.
- Approval is optional; rejection and exit are valid outcomes.
- Retry may call the connected test application.
- Restore reverts ZapFix workflow settings and does not undo actions already performed in an external application.

Stop the session if real customer data, credentials, tokens, or another person's account appears. Do not copy sensitive content into notes, recordings, screenshots, or issue reports.

## Moderator guidance

Use neutral prompts and allow silence while the participant works. Suitable prompts include:

- "What are you looking for?"
- "What do you think happened?"
- "What do you expect this action to do?"
- "What information are you using to decide?"
- "What, if anything, feels uncertain?"

Do not say:

- "Click Diagnose."
- "That recommendation is correct."
- "You should approve this."
- "The AI found the answer."
- "Restore will undo everything."

If the participant is blocked, wait before offering help. Record the point of failure and the minimum prompt required. Mark the task as assisted once the moderator provides procedural guidance beyond a neutral prompt.

## Session structure

Plan approximately 30 to 40 minutes:

1. Welcome, consent, and safety briefing: 5 minutes.
2. Background questions: 5 minutes.
3. Scenario and task sequence: 15 to 20 minutes.
4. Post-task survey and debrief: 5 to 10 minutes.

The moderator may end the session early for a safety concern, an unrecoverable product failure, or participant withdrawal. Record why the session ended; do not treat an incomplete product session as participant failure.

## Pre-session questions

Ask without requiring the participant to disclose confidential business information:

1. What is your role, and what kinds of repeatable processes do you manage?
2. Have you used Zapier or another workflow-automation product? If so, how often?
3. Tell us about a time an automated workflow failed. How did you find and resolve the problem?
4. How comfortable are you reading technical error messages on a scale from 1 to 5?
5. What information would you want before allowing software to change a workflow setting?

## Participant scenario

Give the participant this scenario without naming the expected error category or repair:

> You manage a workflow that takes information entered in a form and creates an event in a test Google Calendar. A recent test run failed. You want to understand what happened, decide whether ZapFix's recommendation is safe, and determine whether the workflow can run successfully. Work as you normally would. You may approve, reject, or leave the recommendation based on the information you see.

Use a supported Calendar failure that has been internally verified before the session. The same scenario and starting configuration should be used for every participant in a comparable round.

## Participant task sheet

Give these tasks one at a time. Do not reveal later tasks early if doing so would direct the participant's behavior.

### Task 1 Identify the failure

Open the failed workflow run and determine:

- Which step failed.
- Which step, if any, succeeded first.
- What information the application originally returned.

Ask the participant to explain the failure in their own words before continuing.

### Task 2 Request and assess a diagnosis

Ask ZapFix to diagnose the failure. Review the result and explain:

- What the system confirms.
- What ZapFix interprets or generates with AI.
- How confident the recommendation appears to be.
- Whether any information seems uncertain or insufficient.

Do not correct the participant during the task. Record whether they distinguish confirmed evidence from AI-generated explanation.

### Task 3 Review the proposed repair

Review the proposed change and decide what you would do. Before acting, explain:

- The current value.
- The proposed value.
- The expected effect.
- What will happen if you reject or exit.
- What gives you confidence or concern.

Approval is not the expected answer. The task succeeds when the participant makes and explains an informed decision using the displayed information.

### Task 4 Make a decision

Approve, reject, or leave the proposal based on your judgment.

If the participant rejects or exits, ask what drove the decision and finish the scenario without applying a change. Do not ask them to reverse a deliberate decision merely to exercise the approval path. Use a separate, clearly identified follow-up demonstration only if the study plan requires observing retry and restore after a rejection.

If the participant approves, record when the final approval summary first becomes visible and when the participant confirms or chooses another outcome.

### Task 5 Verify the result

When a change was approved and applied, retry the failed step and determine:

- Whether the retry is still running, succeeded, or failed.
- Whether the original error was resolved.
- Whether a different error requires a new diagnosis.

Record every retry attempt. Do not trigger an additional retry solely to improve a measured result.

### Task 6 Understand restoration

Ask the participant to explain, before selecting it:

- What Restore will change.
- What Restore will not undo.
- When they would use it.

If restoration is part of the approved test scenario, have the participant complete it and verify the previous ZapFix configuration is shown. Do not imply that Restore reverses an external calendar action.

## Observer rubric

For each task, record one outcome:

- **Completed independently:** The participant finishes without procedural help.
- **Completed with assistance:** The participant finishes after moderator guidance beyond neutral prompts.
- **Not completed:** The participant cannot finish or reaches an incorrect end state.
- **Not attempted:** The product state or participant's valid earlier decision makes the task unavailable.

Also record concise evidence in the participant's own words. Do not infer understanding from clicks alone.

### Required observations

- Failed step identified correctly.
- Previous successful step identified correctly, when present.
- Original error located.
- Likely cause explained correctly in the participant's own words.
- System-confirmed evidence distinguished from AI-generated explanation.
- Confidence or uncertainty noticed and interpreted appropriately.
- Current and proposed values identified correctly.
- Participant recognizes that no change occurs without confirmation.
- Approval, rejection, or exit decision is supported by a stated reason.
- Recommendation is not described as guaranteed to work.
- Retry status and outcome interpreted correctly.
- Original error resolution assessed correctly.
- Restore scope explained correctly.
- Number and type of moderator interventions.
- Product errors, ambiguous language, and unexpected states encountered.

### Timing points

Capture timestamps or elapsed time for:

- Failed run opened.
- Diagnosis requested.
- Diagnosis first displayed.
- Approval summary first displayed.
- Proposal approved, rejected, or exited.
- Retry started and completed.
- Restore started and completed, when attempted.

The primary decision-time measure is from opening the failure to approving or rejecting the proposal, matching the repository's documented metric definition. Keep notes about pauses caused by product errors or moderator intervention so the result is not misrepresented.

## Post-task survey

Ask the participant to rate each statement from 1, strongly disagree, to 5, strongly agree:

1. I understood which workflow step failed.
2. I understood the likely cause of the failure.
3. I could tell which information came from the system and which explanation was AI-generated.
4. I understood exactly what setting would change.
5. I understood that the recommendation might be incorrect.
6. I felt in control of whether a change would be applied.
7. I understood the result of the retry.
8. I understood what Restore would and would not undo.
9. The diagnosis and recommendation were clear.

Use item 9 as the PRD clarity rating. Preserve the other items separately rather than combining them into a new success metric.

Then ask:

- What was the easiest part of the experience?
- What was the most confusing or concerning part?
- What information, if any, was missing before you made your decision?
- Did anything make the AI explanation seem more certain than it should?
- What would you change before using this on a real workflow?

## Session closeout

Tell the participant that the scenario is complete and remind them that it used test data. Confirm that no participant credentials or production data were collected in the notes.

After the participant leaves:

1. Reset the workflow to the documented starting configuration.
2. Verify the test integration did not create unexpected external records.
3. Label the session record with a non-identifying participant code.
4. Separate product defects from usability observations.
5. Record assisted tasks and technical interruptions before calculating results.
6. Store notes and any recording according to the team's agreed consent and retention process.

Do not report PRD targets as achieved until completed session records have been reviewed and calculated using the T30 measurement materials.

## Moderator completion checklist

- [ ] Participant matches the intended profile.
- [ ] Consent and recording choice captured through the team's approved process.
- [ ] Test account and supported failure verified.
- [ ] Safety briefing read.
- [ ] Pre-session questions completed.
- [ ] Tasks presented one at a time.
- [ ] Assistance and technical interruptions recorded.
- [ ] Timing points recorded.
- [ ] Post-task survey completed.
- [ ] Workflow and external test data reset.
- [ ] Notes contain no secrets, credentials, or unnecessary personal information.

