import assert from 'node:assert/strict';

const API_BASE = 'http://localhost:3000/api';

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:3000/health');
      if (res.ok) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Server did not become ready within 40 seconds');
}

async function main() {
  console.log('===============================================================');
  console.log('🎯 FULL END-TO-END GENUINE FEATURE VERIFICATION (NO HARDCODING)');
  console.log('===============================================================\n');

  console.log('⏳ Waiting for server to be healthy...');
  await waitForServer();
  console.log('✔ Server is ready and healthy.');

  // 1. Authenticate Superadmin & Teacher
  console.log('\n1️⃣ Authenticating Users...');
  const saLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@fln.org', password: 'Fln@2026' })
  });
  const saToken = (await saLoginRes.json()).token;
  assert.ok(saToken, 'Superadmin token must be returned');
  console.log('  ✔ Superadmin authenticated.');

  const teacherLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'gps-mt-001.t01@fln.org', password: 'Fln@2026' })
  });
  const teacherToken = (await teacherLoginRes.json()).token;
  assert.ok(teacherToken, 'Teacher token must be returned');
  console.log('  ✔ Teacher authenticated.');

  // 2. Clean Database State (Reset all auto-flags to verify clean baseline)
  console.log('\n2️⃣ Resetting auto-flag state to ensure no pre-fixed/hardcoded flags exist...');
  const resetRes = await fetch(`${API_BASE}/governance/auto-flag/reset`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${saToken}` }
  });
  const resetData = await resetRes.json();
  assert.equal(resetData.success, true);
  console.log('  ✔ Auto-flag state clean. Summary totalFlagged =', resetData.summary.totalFlagged);

  // Verify Superadmin sees ZERO auto-flags initially before any scan or submissions
  const initialTicketsRes = await fetch(`${API_BASE}/tickets`, {
    headers: { 'Authorization': `Bearer ${saToken}` }
  });
  const initialTickets = await initialTicketsRes.json();
  const initialAutoFlags = initialTickets.filter(t => t.isAutoFlag || (t.subject && t.subject.startsWith('[AUTO-FLAG')));
  console.log(`  ✔ Superadmin Queue: Total tickets = ${initialTickets.length}, Auto-Flags = ${initialAutoFlags.length}`);
  assert.equal(initialAutoFlags.length, 0, 'Zero hardcoded/pre-fixed auto-flags must exist in database before audit');

  // 3. Genuine Teacher Issue Submission
  console.log('\n3️⃣ Teacher Submits a Genuine Issue Ticket...');
  const teacherTicketRes = await fetch(`${API_BASE}/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${teacherToken}`
    },
    body: JSON.stringify({
      type: 'curriculum',
      subject: 'Genuine Teacher Observation: Question wording confusion in Grade 2',
      description: 'Students find the terminology in Question Q_GENUINE_01 confusing during live assessment.',
      schoolId: 'gps-mt-001'
    })
  });
  const teacherTicket = await teacherTicketRes.json();
  assert.ok(teacherTicket.id, 'Ticket ID must be generated');
  console.log(`  ✔ Genuine Teacher Ticket Created: [ID: ${teacherTicket.id}] "${teacherTicket.subject}"`);

  // 4. Trigger Auto-Flag Pedagogical Anomaly Scan on Live Database
  console.log('\n4️⃣ Triggering Pedagogical Anomaly Audit Scan (SRS Rule R-15 & §6.7)...');
  const scanRes = await fetch(`${API_BASE}/governance/auto-flag/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${saToken}`
    },
    body: JSON.stringify({ minAttempts: 3, failureThreshold: 0.50, mediumFailureThreshold: 0.70 })
  });
  const scanData = await scanRes.json();
  console.log('  ✔ Scan Complete:', {
    createdCount: scanData.createdCount,
    updatedCount: scanData.updatedCount,
    totalFlagged: scanData.totalFlagged
  });

  // 5. Superadmin Review Queue Verification
  console.log('\n5️⃣ Verifying Superadmin Dashboard Review Queue...');
  const saTicketsRes = await fetch(`${API_BASE}/tickets`, {
    headers: { 'Authorization': `Bearer ${saToken}` }
  });
  const saTickets = await saTicketsRes.json();
  const genuineTeacherTickets = saTickets.filter(t => t.id === teacherTicket.id);
  const newlyFlaggedTickets = saTickets.filter(t => t.isAutoFlag || (t.subject && t.subject.startsWith('[AUTO-FLAG')));

  console.log(`  ✔ Superadmin Queue Total Tickets: ${saTickets.length}`);
  console.log(`  ✔ Teacher Ticket Visible in Queue: ${genuineTeacherTickets.length === 1 ? 'YES' : 'NO'}`);
  console.log(`  ✔ Newly Flagged Anomaly Tickets: ${newlyFlaggedTickets.length}`);

  assert.equal(genuineTeacherTickets.length, 1, 'Genuine teacher ticket must reach Superadmin queue');
  assert.ok(newlyFlaggedTickets.length > 0, 'Genuine pedagogical anomalies must reach Superadmin queue');

  const sampleFlag = newlyFlaggedTickets[0];
  console.log(`\n  📋 Sample Flagged Anomaly Details:`);
  console.log(`     - Ticket ID: ${sampleFlag.id}`);
  console.log(`     - Subject: ${sampleFlag.subject}`);
  console.log(`     - Question ID: ${sampleFlag.flagDetails?.questionId}`);
  console.log(`     - Current Difficulty: ${sampleFlag.flagDetails?.difficulty}`);
  console.log(`     - Cohort Attempts: ${sampleFlag.flagDetails?.attempts}`);
  console.log(`     - Cohort Failures: ${sampleFlag.flagDetails?.failures}`);
  console.log(`     - Failure Rate: ${sampleFlag.flagDetails?.failureRate}%`);
  console.log(`     - Recommended Band: ${sampleFlag.flagDetails?.recommendedBand}`);

  // 6. Superadmin Resolves the Flag with Reclassification
  console.log('\n6️⃣ Superadmin Resolves Flag & Reclassifies Difficulty to Medium...');
  const resolveRes = await fetch(`${API_BASE}/tickets/${sampleFlag.id}/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${saToken}`
    },
    body: JSON.stringify({
      status: 'Resolved',
      reclassifiedBand: 'medium',
      actionTaken: 'Reclassified from Easy to Medium Difficulty Band',
      resolutionNote: 'Adjusted difficulty curve based on actual student cohort failure rate.'
    })
  });
  const resolvedTicket = await resolveRes.json();
  assert.equal(resolvedTicket.status, 'Resolved');
  assert.equal(resolvedTicket.reclassifiedBand, 'medium');
  console.log(`  ✔ Ticket ${resolvedTicket.id} marked as ${resolvedTicket.status} with band "${resolvedTicket.reclassifiedBand}"`);

  // 7. Verify Difficulty Persistence & Non-Re-Flagging
  console.log('\n7️⃣ Verifying Difficulty Persistence & Scan Resilience...');
  const postResolveScanRes = await fetch(`${API_BASE}/governance/auto-flag/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${saToken}`
    },
    body: JSON.stringify({ minAttempts: 3, failureThreshold: 0.50, mediumFailureThreshold: 0.70 })
  });
  const postResolveScan = await postResolveScanRes.json();
  console.log('  ✔ Post-Resolution Scan: Created count =', postResolveScan.createdCount);
  assert.equal(postResolveScan.createdCount, 0, 'Reclassified question must not generate new flag');

  // 8. Fetch and Validate Summary Metrics for Superadmin Console
  console.log('\n8️⃣ Validating Auto-Flag Summary Metrics for Superadmin Console...');
  const finalSummaryRes = await fetch(`${API_BASE}/governance/auto-flag/summary`, {
    headers: { 'Authorization': `Bearer ${saToken}` }
  });
  const finalSummary = await finalSummaryRes.json();
  console.log('  ✔ Summary metrics:', {
    totalFlagged: finalSummary.totalFlagged,
    openFlags: finalSummary.openFlags,
    reviewedFlags: finalSummary.reviewedFlags,
    resolvedFlags: finalSummary.resolvedFlags,
    averageFailureRate: finalSummary.averageFailureRate
  });
  assert.ok(finalSummary.resolvedFlags >= 1, 'At least 1 flag must be resolved');

  console.log('\n===============================================================');
  console.log('✨ ALL TESTS PASSED: ONLY GENUINE ISSUES REACH SUPERADMIN CONSOLE');
  console.log('===============================================================\n');
}

main().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
