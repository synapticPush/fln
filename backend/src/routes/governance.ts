import express from 'express';
import { dbStore } from '../db';
import { getAuthUser } from '../auth';
import { autoFlagService } from '../services/autoFlagService';

export function registerGovernanceRoutes(app: express.Express) {
  // Automated Pedagogical Level-Flagging Engine (SRS Rule R-15 & §6.7)
  app.post('/api/governance/auto-flag/scan', async (req, res) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const minAttempts = req.body?.minAttempts !== undefined ? parseInt(req.body.minAttempts, 10) : 3;
      const failureThreshold = req.body?.failureThreshold !== undefined ? parseFloat(req.body.failureThreshold) : 0.50;
      const mediumFailureThreshold = req.body?.mediumFailureThreshold !== undefined ? parseFloat(req.body.mediumFailureThreshold) : 0.70;
      const worksheetId = req.body?.worksheetId;

      const scanResult = await autoFlagService.checkAndFlagQuestions({
        minAttempts,
        failureThreshold,
        mediumFailureThreshold,
        worksheetId
      });

      const summary = await autoFlagService.getAutoFlagSummary();

      res.json({
        success: true,
        createdCount: scanResult.created.length,
        updatedCount: scanResult.updated.length,
        totalFlagged: scanResult.allFlags.length,
        summary
      });
    } catch (err: any) {
      console.error('Error executing Auto-Flag scan:', err);
      res.status(500).json({ error: 'Failed to run pedagogical auto-flag scan: ' + (err?.message || err) });
    }
  });

  app.get('/api/governance/auto-flag/summary', async (req, res) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const summary = await autoFlagService.getAutoFlagSummary();
      res.json(summary);
    } catch (err: any) {
      console.error('Error fetching Auto-Flag summary:', err);
      res.status(500).json({ error: 'Failed to fetch auto-flag summary' });
    }
  });

  app.post('/api/governance/auto-flag/reset', async (req, res) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      await dbStore.resetAutoFlagState();
      await dbStore.addLog({
        id: 'log_reset_' + Date.now(),
        timestamp: new Date().toISOString(),
        schoolId: 'NATIONAL',
        schoolName: 'Superadmin Console',
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        activityType: 'ticket',
        status: 'Success',
        details: 'Reset all pedagogical auto-flags, telemetry submissions, and diagnostic test states for fresh validation.'
      });

      const summary = await autoFlagService.getAutoFlagSummary();
      res.json({ success: true, message: 'Auto-flag state and demo diagnostics successfully reset.', summary });
    } catch (err: any) {
      console.error('Error resetting auto-flag state:', err);
      res.status(500).json({ error: 'Failed to reset auto-flag state: ' + (err?.message || err) });
    }
  });
}
