import assert from 'node:assert/strict';

const API_BASE = 'http://localhost:3000/api';

async function main() {
  console.log('🔄 Resetting all test data in the database from previous test runs...');

  // 1. Authenticate as Superadmin
  const saLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@fln.org', password: 'Fln@2026' })
  });
  if (!saLoginRes.ok) {
    throw new Error(`Superadmin login failed: ${saLoginRes.status} ${await saLoginRes.text()}`);
  }
  const { token: saToken } = await saLoginRes.json();
  console.log('✔ Superadmin authenticated.');

  // 2. Authenticate as Teacher
  const teacherLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'gps-mt-001.t01@fln.org', password: 'Fln@2026' })
  });
  if (!teacherLoginRes.ok) {
    throw new Error(`Teacher login failed: ${teacherLoginRes.status} ${await teacherLoginRes.text()}`);
  }
  const { token: teacherToken, user: teacherUser } = await teacherLoginRes.json();
  console.log(`✔ Teacher authenticated (${teacherUser.name} - ${teacherUser.schoolName}).`);

  // 3. Call Reset Endpoint
  console.log('\n🧹 Triggering database reset endpoint...');
  const resetRes = await fetch(`${API_BASE}/governance/auto-flag/reset`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${saToken}` }
  });
  assert.equal(resetRes.status, 200, 'Reset endpoint should return 200');
  const resetData = await resetRes.json();
  console.log('✔ Reset Response:', resetData);

  // 4. Verify Superadmin tickets & auto-flag summary
  console.log('\n🔍 Verifying Superadmin Dashboard State:');
  const summaryRes = await fetch(`${API_BASE}/governance/auto-flag/summary`, {
    headers: { 'Authorization': `Bearer ${saToken}` }
  });
  const summary = await summaryRes.json();
  console.log('  Summary:', JSON.stringify(summary));
  assert.equal(summary.totalFlagged, 0, 'totalFlagged must be 0 after reset');
  assert.equal(summary.flags.length, 0, 'flags array must be empty after reset');

  const ticketsRes = await fetch(`${API_BASE}/tickets`, {
    headers: { 'Authorization': `Bearer ${saToken}` }
  });
  const tickets = await ticketsRes.json();
  const autoFlags = tickets.filter(t => t.isAutoFlag || (t.subject && t.subject.startsWith('[AUTO-FLAG')));
  const testTickets = tickets.filter(t => t.id && t.id.startsWith('tkt_'));
  console.log(`  Total regular baseline tickets remaining: ${tickets.length}`);
  console.log(`  Auto-flags in ticket queue: ${autoFlags.length} (Expected 0)`);
  console.log(`  Temporary test tickets in ticket queue: ${testTickets.length} (Expected 0)`);
  assert.equal(autoFlags.length, 0, 'There should be 0 auto-flags');
  assert.equal(testTickets.length, 0, 'There should be 0 test-generated tickets');

  // 5. Verify Teacher Classroom Dashboard State
  console.log('\n🔍 Verifying Teacher Dashboard State:');
  const studentsRes = await fetch(`${API_BASE}/students?limit=100`, {
    headers: { 'Authorization': `Bearer ${teacherToken}` }
  });
  const totalCount = parseInt(studentsRes.headers.get('x-total-count') || '0', 10);
  const students = await studentsRes.json();
  console.log(`  Active Students loaded: ${students.length} (Total in school: ${totalCount || students.length})`);
  assert.ok(students.length >= 10 || totalCount >= 10, 'Teacher classroom must have roster students (Class 2, 3, 4)');

  const classesRes = await fetch(`${API_BASE}/classes`, {
    headers: { 'Authorization': `Bearer ${teacherToken}` }
  });
  const classes = await classesRes.json();
  console.log(`  Active Classes loaded: ${classes.length} (${classes.map(c => c.name).join(', ')})`);
  assert.ok(classes.length >= 3, 'Teacher classroom must have classes (Class 2, 3, 4)');

  console.log('\n===============================================================');
  console.log('✅ DATABASE RESET COMPLETE: CLEAN DASHBOARDS READY FOR TESTING!');
  console.log('===============================================================');
}

main().catch(err => {
  console.error('❌ Error resetting test data:', err);
  process.exit(1);
});
