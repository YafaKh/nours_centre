# SPEC: Online Quiz System for Nour's Tutoring Centre

Status: Draft v1 Scope: First clickable version ("something to click through by Thursday")

This spec describes WHAT the system does and WHY. Tech choices go in PLAN.md. The client is not available for questions, so every gap is closed with a decision, marked **\[DECISION\]**. Each decision is copied to DECISIONS.md.

---

## 1\. Background and goal

Nour runs a tutoring centre in Amman with about 300 students and 12 teachers. Weekly quizzes are on paper, which takes too much time to run and mark.

Goal: replace paper quizzes with a simple website where students take timed multiple choice quizzes, teachers create quizzes, and staff see results.

The system must work well on phones, because most students only have a phone.

## 2\. Users and roles

| Role | Who | Main need |
| :---- | :---- | :---- |
| Student | \~300 students, grouped in classes | Log in, take an open quiz once, see their score |
| Teacher | 12 teachers, 4 at launch | Create quizzes for their classes, see results |
| Admin | Nour (centre owner) | See all results, manage users and classes, import spreadsheets |

- **\[DECISION\]** Nour gets an Admin role. "I also want to see how the students did" means she sees results across all teachers, not only her own quizzes.  
- **\[DECISION\]** Teachers see and edit only their own quizzes and results. They cannot see other teachers' quizzes.  
- **\[DECISION\]** There is no self sign-up. Accounts are created only by the Admin, either by spreadsheet import or by hand.

## 3\. User stories

### Student

- S1. As a student, I log in with a username and password.  
- S2. As a student, I see the quizzes for my class that are open now, upcoming, and already done.  
- S3. As a student, I start an open quiz and see a countdown timer.  
- S4. As a student, I answer questions one by one or scroll through them, and change my answers before submitting.  
- S5. As a student, if my phone loses connection or I refresh, I return to the same attempt with my saved answers and the timer still running.  
- S6. As a student, I see my score when I submit or when time runs out.  
- S7. As a student, I cannot take the same quiz twice.

### Teacher

- T1. As a teacher, I create a quiz with a title, target class(es), time limit, open date and close date.  
- T2. As a teacher, I add questions with four options, one correct answer, and points per question.  
- T3. As a teacher, I choose whether this quiz uses negative marking, and how much.  
- T4. As a teacher, I write quizzes in Arabic or English, and they display correctly.  
- T5. As a teacher, I see results for my quizzes: who took it, scores, who did not take it.  
- T6. As a teacher, I can import a quiz's questions from a spreadsheet instead of typing them.

### Admin (Nour)

- A1. As the admin, I import the student list and teacher list from spreadsheets.  
- A2. As the admin, I see results for every quiz, filterable by class, teacher and quiz.  
- A3. As the admin, I export results to a spreadsheet.  
- A4. As the admin, I can reset a student's password.

## 4\. Functional requirements

### 4.1 Login and access

- FR-001. Users log in with username and password.  
- FR-002. **\[DECISION\]** Username for students is their student ID from the centre's list. Teachers log in with their email.  
- FR-003. Every page and API call checks the role on the server. The user interface hiding a button is not enough.  
- FR-004. A student can only see quizzes assigned to their own class.  
- FR-005. Passwords are stored hashed, never in plain text.  
- FR-006. Repeated failed logins are slowed down (rate limited).  
- **FR-007. \[DECISION\]** Admin has all teacher abilities (create, edit and import quizzes) plus the admin abilities. Admin can also edit any teacher's quiz, with the same lock rule as FR-014. 

### 4.2 Quizzes

- FR-010. A quiz has: title, owner teacher, target class(es), time limit in minutes (default 20), open date/time, close date/time, negative marking setting, and a list of questions.  
- FR-011. A question has: text, exactly four options, exactly one correct option, and points (a positive number).  
- FR-012. **\[DECISION\]** All dates and times are in Amman time (Asia/Amman).  
- FR-013. A quiz can be saved as a draft. Students only see published quizzes.  
- FR-014. **\[DECISION\]** Once any student has started a quiz, its questions, options, correct answers, points, and close date are all locked — no field of a started quiz can be edited. This stops scores from changing and stops a running student's deadline from shifting after students have taken it.  
- FR-015. **\[DECISION\]** One quiz can target more than one class.

### 4.3 Taking a quiz

- FR-020. A student can start a quiz only when now is between the open and close time, and they have no attempt yet.  
- FR-021. Starting a quiz creates one attempt record with a server start time. The countdown is calculated from the server time, not the phone's clock.  
- FR-022. **\[DECISION\]** The attempt deadline is the earlier of (start time \+ time limit) and the quiz close time. A student who starts 5 minutes before closing gets 5 minutes.  
- FR-023. Each answer is saved to the server as soon as the student picks it.  
- FR-024. Refreshing, closing the browser, or opening a second tab returns the student to the same attempt. The timer does not restart.  
- FR-025. When time runs out, the attempt is submitted automatically with the answers saved so far, even if the student never comes back.  
- FR-026. **\[DECISION\]** Answers arriving after the deadline are rejected, with a small grace period (10 seconds) for network delay.  
- FR-027. A student can only ever have one attempt per quiz. This is enforced in the database (unique constraint), not only in code, so two taps at the same time cannot create two attempts.  
- FR-028. The correct answers are never sent to the student's browser before the attempt is submitted.  
- FR-029. **\[DECISION\]** Question and option order are the same for all students in v1. Shuffling is listed as a next step.

### 4.4 Scoring and negative marking

- FR-030. Correct answer: student gets the question's points.  
- FR-031. Unanswered question: 0 points, never negative.  
- FR-032. Wrong answer, negative marking OFF: 0 points.  
- FR-033. Wrong answer, negative marking ON: the student loses a penalty set per quiz as a fraction of that question's points (for example 0.25 means a wrong answer on a 4 point question costs 1 point).  
- FR-034. **\[DECISION\]** Negative marking is set per quiz, not per question. The brief says it "depends on the teacher and the quiz", so quiz level covers both.  
- FR-035. **\[DECISION\]** The total score cannot go below 0\.  
- FR-036. The score is calculated on the server at submission and stored with the attempt.  
- FR-037. The student sees: score, maximum score, and number correct / wrong / unanswered.  
- **\[DECISION\]** Student exam review (viewing correct answers/questions after submission) is out of scope for v1. This also means a student cannot reopen a quiz to see its question/option text again once their attempt is submitted (manually or automatically) or the quiz's close time has passed — the quiz-taking API drops question/answer content entirely once an attempt is submitted, returning only its score and status. The quiz list still shows the student their own score per quiz (FR-037).

### 4.5 Results

- FR-040. For each quiz, the teacher and admin see: each student in the target classes, their score, submission time, and status (submitted, in progress, auto-submitted, not attempted).  
- FR-041. Summary per quiz: average, highest, lowest, number attempted out of total.  
- FR-042. Per question: percentage of students who got it right, so teachers can spot hard or broken questions.  
- FR-043. Results can be exported to CSV that opens correctly in Excel, including Arabic names (UTF-8 with BOM).

### 4.6 Spreadsheet import

- FR-050. The admin can import students, teachers and quizzes from CSV or XLSX files.  
- FR-051. Each import type has a documented column layout, and a sample file is provided in the repo.  
- FR-052. Import validates every row and shows clear errors with row numbers (for example "Row 14: class 12C does not exist"). Nothing is saved if any row fails.  
- FR-052a. **\[DECISION\]** Each import screen (students, teachers, quiz questions) has a "Download template" button that gives a CSV pre-filled with the exact expected header row and one or two example rows, so the user never has to guess the column layout or find it in the repo.  
- FR-053. Importing the same student list twice does not create duplicates. Existing students are updated by student ID.  
- FR-054. **\[DECISION\]** Imported students get an initial password that the admin can see and hand out. Forcing a password change on first login is listed as a next step.  
- FR-055. **\[DECISION\]** Quiz import carries questions only, not quiz-level settings. The teacher first creates the quiz shell in the website form (title, target class(es), time limit, open/close dates, negative marking), then imports the question list into it. Column layout: `question_no, question_text, option_a, option_b, option_c, option_d, correct, points`, where `correct` is one of `A`/`B`/`C`/`D`.

### 4.7 Arabic and language

- FR-060. All names, quiz text and options support Arabic fully, stored as UTF-8.  
- FR-061. Arabic text displays right to left, English left to right, including mixed questions (for example Arabic text with numbers or English terms).  
- FR-062. **\[DECISION\]** Direction is detected per text block automatically, so a quiz can mix Arabic and English questions.  
- FR-063. **\[DECISION\]** The interface itself (buttons, menus) is in English for v1. Full Arabic interface is a next step.  
- FR-064. Searching students works with Arabic names.  
- FR-065. **\[DECISION\]** Every person (student, teacher, admin) has two name fields: name\_ar (Arabic) and name\_en (English letters).  
- FR-066. **\[DECISION\]** At least one of the two names is required. Neither one alone is mandatory, because the centre’s spreadsheets may only have one of them for some people.  
- FR-067. **\[DECISION\]** Display rule: tables for teachers and admin (results, class lists) show both names in two columns. Everywhere else (header, results summary), show name\_en if filled, otherwise name\_ar.  
- FR-068. Search looks in both name fields. Sorting uses the displayed name.  
- FR-069. Light validation: name\_ar must contain Arabic letters, and name\_en must contain Latin letters, to catch the two columns being swapped on import.

### 4.8 Mobile and design

- FR-070. Mobile first. Every student page works on a 360px wide phone screen without sideways scrolling.  
- FR-071. Buttons and answer options are large enough to tap easily.  
- FR-072. The timer stays visible while scrolling.  
- FR-073. The student is asked to confirm before submitting, and warned if questions are unanswered.  
- FR-074. Clean, simple design. No designer is needed to make it presentable.

## 5\. Key entities

- **User**: name\_ar, name\_en (at least one required), username, password hash, role (student / teacher / admin).  
- **Class**: name (10A, 10B, 11A).  
- **Student**: user \+ class \+ student ID \+ email (optional in v1, captured now so passwords can be emailed later).  
- **Teacher**: user \+ email.  
- **Quiz**: owner teacher, title, target classes, time limit, open time, close time, negative marking on/off, penalty fraction, status (draft / published).  
- **Question**: quiz, order, text, points.  
- **Option**: question, order, text, is correct.  
- **Attempt**: student, quiz, started at, deadline, submitted at, submission type (manual / auto), score. Unique per student \+ quiz.  
- **Answer**: attempt, question, chosen option, answered at.

## 6\. Sample data

The real data will come as spreadsheets later. Sample data must look like Nour's and load with one command.

- 3 classes: 10A, 10B, 11A, with about 20 students each (60 total).  
- Names in both fields for most people. Some have only name\_ar and a few only name\_en, to show that both cases work.  
- 4 teachers and 1 admin (Nour).  
- At least 4 quizzes of 15 questions each, 4 options, mixed points per question:  
  - one open now, one closed with results, one upcoming, one draft  
  - at least one quiz fully in Arabic  
  - at least one quiz with negative marking and one without  
- Some finished attempts so the results pages are not empty.  
- Sample data is stored as CSV/XLSX files in the same format as the import, so loading the sample also tests the import.

## 7\. Success criteria

- SC-001. A student can log in and finish a 15 question quiz on a phone in one sitting with no layout problems.  
- SC-002. It is impossible to get two attempts on one quiz, including by double tapping, using two tabs, or calling the API directly.  
- SC-003. It is impossible to submit answers after the deadline (beyond the grace period), even by changing the phone's clock or calling the API directly.  
- SC-004. Scores match hand calculation for all cases: all correct, all wrong, all unanswered, mixed, with and without negative marking, and the floor at 0\.  
- SC-005. A student cannot see correct answers before submitting, or another class's quizzes, by any route.  
- SC-006. Arabic names and quizzes display correctly on screen and in the exported CSV.  
- SC-007. The project runs from a clean machine with one command, as written in the README.  
- SC-008. A bad spreadsheet row gives a clear error and saves nothing.

## 8\. Priority tests

Tests focus on what hurts most if wrong:

1. Scoring, including negative marking and the 0 floor.  
2. One attempt per student per quiz, including two requests at the same time.  
3. Timer and deadline enforced on the server, including auto-submit and quiz close time.  
4. Quiz open/close window.  
5. Role and class access checks (student vs teacher vs admin, teacher A vs teacher B).  
6. Correct answers not leaked in the quiz API before submission.  
7. Spreadsheet import validation, including Arabic text.

## 9\. Out of scope for v1

Listed in DECISIONS.md with reasons:

- Password reset by email or SMS  
- Question types other than single answer multiple choice  
- Notification system for students with new quizzes   
- Images or formulas in questions  
- Full Arabic user interface  
- Parent accounts  
- Anti-cheating beyond server-side timing (for example tab switching detection)  
- Student exam review (viewing correct answers or reviewing submitted questions)  
- Editing a quiz after students have started it (including the close date — no exceptions)

## 10\. Next steps (if another week)

- Enhance the overall UI/UX
- Shuffle question and option order per student  
- Force password change on first login  
- Allow a teacher to extend a quiz's close date after students have started attempts, with clear rules for how it affects already-running deadlines  
- Email students their initial password (and future resets) automatically, instead of the admin handing it out — student email is already captured in v1 to make this a drop-in addition later  
- Create notification system for students with new quizzes (probably by email)  
- Arabic interface translation  
- Allow teacher to extend time for one student (special needs, connection problems)  
- Question bank to reuse questions across quizzes  
- Charts of student progress over weeks  
- Allow students to review their exam answers and view correct answers after submission

## 11\. Delivery constraints (from the assessment)

- Public GitHub repo with full source code, meaningful commit history.  
- Runs with one command on a clean machine, against SQLite — exact steps and the required Node version are in the README (tech choice detailed in PLAN.md).  
- README.md: how to run, how to load sample data, login details for each role.  
- DECISIONS.md: assumptions, extras built and why, what was left out, next steps.  
- AI\_USAGE.md: tools used, how they were directed, how output was checked. CLAUDE.md committed.  
- Automated tests for the priorities in section 8\.