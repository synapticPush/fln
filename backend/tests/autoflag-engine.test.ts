import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ─── Bootstrap: isolate env + cwd BEFORE importing application modules ─────
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fln-autoflag-test-'));
fs.mkdirSync(path.join(scratchDir, 'data'), { recursive: true });
process.chdir(scratchDir);
delete process.env.MONGODB_URI;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'dev-insecure-secret-change-me';

const { dbStore } = await import('../src/db');
const { autoFlagService } = await import('../src/services/autoFlagService');

await dbStore.init();

test('Autoflag Engine Unit Tests (SRS Rule R-15 & §6.7)', async (t) => {
  await t.test('flags easy question when failure rate >= 50% and cohort attempts >= 3', async () => {
    // Setup a worksheet with an easy question
    const testWs = {
      id: 'test_ws_autoflag_1',
      title: 'AutoFlag Test Worksheet 1',
      level: 5,
      schoolId: 'gps-mt-001',
      createdAt: new Date().toISOString(),
      questions: [
        {
          question_id: 'q_easy_test_fail_1',
          question: 'What is 2 + 2?',
          answer: '4',
          difficulty: 'easy' as const,
          source_level: 5,
          topic: 'Addition'
        }
      ]
    };
    await dbStore.addWorksheet(testWs);

    // Add 4 submissions: 1 correct, 3 wrong (75% failure rate)
    const submissions = [
      {
        id: 'sub_af_1',
        worksheetId: testWs.id,
        studentId: 'st_1',
        schoolId: 'gps-mt-001',
        answers: { q_easy_test_fail_1: '4' },
        submittedAt: new Date().toISOString()
      },
      {
        id: 'sub_af_2',
        worksheetId: testWs.id,
        studentId: 'st_2',
        schoolId: 'gps-mt-001',
        answers: { q_easy_test_fail_1: '5' }, // wrong
        submittedAt: new Date().toISOString()
      },
      {
        id: 'sub_af_3',
        worksheetId: testWs.id,
        studentId: 'st_3',
        schoolId: 'gps-mt-001',
        answers: { q_easy_test_fail_1: '3' }, // wrong
        submittedAt: new Date().toISOString()
      },
      {
        id: 'sub_af_4',
        worksheetId: testWs.id,
        studentId: 'st_4',
        schoolId: 'gps-mt-001',
        answers: { q_easy_test_fail_1: '22' }, // wrong
        submittedAt: new Date().toISOString()
      }
    ];

    for (const sub of submissions) {
      await dbStore.addAnswerSubmission(sub);
    }

    const scanResult = await autoFlagService.checkAndFlagQuestions({ worksheetId: testWs.id, minAttempts: 3 });
    assert.ok(scanResult.created.length > 0 || scanResult.updated.length > 0, 'Should flag the question');

    const flag = scanResult.created.find(f => f.flagDetails?.questionId === 'q_easy_test_fail_1')
      || scanResult.updated.find(f => f.flagDetails?.questionId === 'q_easy_test_fail_1');

    assert.ok(flag, 'Flag ticket must be created/updated');
    assert.equal(flag?.flagDetails?.questionId, 'q_easy_test_fail_1');
    assert.equal(flag?.flagDetails?.difficulty, 'easy');
    assert.equal(flag?.flagDetails?.attempts, 4);
    assert.equal(flag?.flagDetails?.failures, 3);
    assert.equal(flag?.flagDetails?.failureRate, 75);
    assert.equal(flag?.isAutoFlag, true);
  });

  await t.test('does not flag questions with high pass rate (< 50% failure)', async () => {
    const testWsPass = {
      id: 'test_ws_autoflag_pass',
      title: 'AutoFlag Passing Worksheet',
      level: 3,
      schoolId: 'gps-mt-001',
      createdAt: new Date().toISOString(),
      questions: [
        {
          question_id: 'q_easy_test_pass_1',
          question: 'What is 1 + 1?',
          answer: '2',
          difficulty: 'easy' as const,
          source_level: 3,
          topic: 'Addition'
        }
      ]
    };
    await dbStore.addWorksheet(testWsPass);

    // 4 submissions: 3 correct, 1 wrong (25% failure rate)
    const submissions = [
      { id: 'sub_pass_1', worksheetId: testWsPass.id, studentId: 'st_1', schoolId: 'gps-mt-001', answers: { q_easy_test_pass_1: '2' }, submittedAt: new Date().toISOString() },
      { id: 'sub_pass_2', worksheetId: testWsPass.id, studentId: 'st_2', schoolId: 'gps-mt-001', answers: { q_easy_test_pass_1: '2' }, submittedAt: new Date().toISOString() },
      { id: 'sub_pass_3', worksheetId: testWsPass.id, studentId: 'st_3', schoolId: 'gps-mt-001', answers: { q_easy_test_pass_1: '2' }, submittedAt: new Date().toISOString() },
      { id: 'sub_pass_4', worksheetId: testWsPass.id, studentId: 'st_4', schoolId: 'gps-mt-001', answers: { q_easy_test_pass_1: '11' }, submittedAt: new Date().toISOString() }
    ];

    for (const sub of submissions) {
      await dbStore.addAnswerSubmission(sub);
    }

    const scanResult = await autoFlagService.checkAndFlagQuestions({ worksheetId: testWsPass.id, minAttempts: 3 });
    const flag = scanResult.created.find(f => f.flagDetails?.questionId === 'q_easy_test_pass_1');
    assert.equal(flag, undefined, 'Should NOT flag question with 25% failure rate');
  });

  await t.test('tolerates equivalent numbers e.g. "05" and "5.0" for correct answers', async () => {
    const testWsNum = {
      id: 'test_ws_autoflag_num',
      title: 'AutoFlag Numeric Tolerance Worksheet',
      level: 2,
      schoolId: 'gps-mt-001',
      createdAt: new Date().toISOString(),
      questions: [
        {
          question_id: 'q_num_tol_1',
          question: 'What is 5 + 0?',
          answer: '5',
          difficulty: 'easy' as const,
          source_level: 2,
          topic: 'Addition'
        }
      ]
    };
    await dbStore.addWorksheet(testWsNum);

    const submissions = [
      { id: 'sub_num_1', worksheetId: testWsNum.id, studentId: 'st_1', schoolId: 'gps-mt-001', answers: { q_num_tol_1: '05' }, submittedAt: new Date().toISOString() },
      { id: 'sub_num_2', worksheetId: testWsNum.id, studentId: 'st_2', schoolId: 'gps-mt-001', answers: { q_num_tol_1: '5.0' }, submittedAt: new Date().toISOString() },
      { id: 'sub_num_3', worksheetId: testWsNum.id, studentId: 'st_3', schoolId: 'gps-mt-001', answers: { q_num_tol_1: '5' }, submittedAt: new Date().toISOString() }
    ];

    for (const sub of submissions) {
      await dbStore.addAnswerSubmission(sub);
    }

    const scanResult = await autoFlagService.checkAndFlagQuestions({ worksheetId: testWsNum.id, minAttempts: 3 });
    const flag = scanResult.created.find(f => f.flagDetails?.questionId === 'q_num_tol_1');
    assert.equal(flag, undefined, 'Numeric variants like "05" and "5.0" should be treated as correct');
  });

  await t.test('summary aggregation computes correct metrics', async () => {
    const summary = await autoFlagService.getAutoFlagSummary();
    assert.equal(typeof summary.totalFlagged, 'number');
    assert.equal(typeof summary.openFlags, 'number');
    assert.equal(typeof summary.averageFailureRate, 'number');
    assert.ok(Array.isArray(summary.flags));
  });
});
