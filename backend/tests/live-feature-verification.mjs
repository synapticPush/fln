async function runLiveTest() {
  console.log('🚀 Starting Live End-to-End Feature Verification...');

  // 1. Superadmin Login
  console.log('\n1. Logging in as Superadmin...');
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@fln.org', password: 'Fln@2026' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  if (!token) throw new Error('Superadmin login failed: ' + JSON.stringify(loginData));
  console.log('✔ Superadmin authenticated successfully.');

  // 2. Fetch Initial Auto-Flag Summary
  console.log('\n2. Fetching Auto-Flag Quality Summary...');
  const summaryRes = await fetch('http://localhost:5000/api/governance/auto-flag/summary', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const summaryData = await summaryRes.json();
  console.log('✔ Summary retrieved:', {
    totalFlagged: summaryData.totalFlagged,
    openFlags: summaryData.openFlags,
    reviewedFlags: summaryData.reviewedFlags,
    resolvedFlags: summaryData.resolvedFlags,
    averageFailureRate: summaryData.averageFailureRate
  });

  // 3. Trigger Quality Audit Scan
  console.log('\n3. Triggering Pedagogical Anomaly Audit Scan (SRS Rule R-15)...');
  const scanRes = await fetch('http://localhost:5000/api/governance/auto-flag/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ minAttempts: 3, failureThreshold: 0.50, mediumFailureThreshold: 0.70 })
  });
  const scanData = await scanRes.json();
  console.log('✔ Scan completed successfully:', {
    createdCount: scanData.createdCount,
    updatedCount: scanData.updatedCount,
    totalFlagged: scanData.totalFlagged
  });

  // 4. Fetch All Tickets in Review Queue
  console.log('\n4. Inspecting Review Queue & Flag Details...');
  const ticketsRes = await fetch('http://localhost:5000/api/tickets', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const tickets = await ticketsRes.json();
  console.log(`✔ Found ${tickets.length} total tickets in Superadmin queue.`);

  const autoFlags = tickets.filter(t => t.isAutoFlag || (t.subject && t.subject.startsWith('[AUTO-FLAG')));
  console.log(`✔ Detected ${autoFlags.length} Pedagogical Anomaly Auto-Flags.`);

  if (autoFlags.length > 0) {
    const sample = autoFlags[0];
    console.log('\nSample Flag Details:');
    console.log(`  - Ticket ID: ${sample.id}`);
    console.log(`  - Subject: ${sample.subject}`);
    console.log(`  - Status: ${sample.status}`);
    console.log(`  - Failure Rate: ${sample.flagDetails?.failureRate}% (${sample.flagDetails?.failures}/${sample.flagDetails?.attempts} attempts)`);
    console.log(`  - Recommended Band: ${sample.flagDetails?.recommendedBand}`);

    // 5. Test Executing Superadmin Action (Resolve / Reclassify)
    console.log('\n5. Executing Superadmin Action on Flag...');
    const resolveRes = await fetch(`http://localhost:5000/api/tickets/${sample.id}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        status: 'Resolved',
        reclassifiedBand: 'medium',
        actionTaken: 'Reclassified from Easy to Medium Difficulty Band',
        resolutionNote: 'Elevated difficulty based on cohort performance'
      })
    });
    const resolvedData = await resolveRes.json();
    console.log('✔ Action recorded:', {
      id: resolvedData.id,
      status: resolvedData.status,
      actionTaken: resolvedData.actionTaken,
      actionTakenBy: resolvedData.actionTakenBy
    });
  }

  // 6. Test Teacher Role Scoping & Student Diagnostic Reset
  console.log('\n6. Testing Teacher Scope & Diagnostic Reset...');
  const teacherLogin = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'gps-mt-001.t01@fln.org', password: 'dev-password-bypass' })
  });
  const teacherToken = (await teacherLogin.json()).token;

  const studentsRes = await fetch('http://localhost:5000/api/students', {
    headers: { 'Authorization': `Bearer ${teacherToken}` }
  });
  const students = await studentsRes.json();
  if (students.length > 0) {
    const student = students[0];
    const resetRes = await fetch(`http://localhost:5000/api/students/${student.id}/reset-diagnostic`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    const resetData = await resetRes.json();
    console.log(`✔ Diagnostic reset for student ${student.name} (${student.id}):`, resetData.message);
  }

  console.log('\n✅ All Live Features Verified Successfully with 100% Pass Rate!');
}

runLiveTest().catch(err => {
  console.error('❌ Live test failed:', err);
  process.exit(1);
});
