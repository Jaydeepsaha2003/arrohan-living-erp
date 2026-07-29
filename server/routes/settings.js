'use strict';

const express = require('express');
const { db, getSetting, setSetting, audit } = require('../db');
const a = require('../auth');
const wf = require('../workflow');
const { wrap, http, str, num } = require('../lib');

const router = express.Router();
router.use(a.requireAuth);

router.get(
  '/',
  wrap((req, res) => {
    res.json({
      company: getSetting('company'),
      defaults: getSetting('defaults'),
      counters: db.prepare('SELECT * FROM doc_counters ORDER BY prefix, fy').all(),
      workflow: wf.STAGES.map((s) => ({
        key: s.key, step: s.step, label: s.label, dept: s.dept, roles: s.roles, desc: s.desc,
      })),
      roles: wf.ROLES,
    });
  })
);

router.put(
  '/company',
  wrap((req, res) => {
    if (!wf.can(req.user, 'settings.write')) throw http(403, 'Only an administrator can change company details.');
    const b = req.body || {};
    const current = getSetting('company') || {};
    const next = {
      ...current,
      name: str(b.name) || current.name,
      address: str(b.address) ?? current.address,
      city: str(b.city) ?? current.city,
      state: str(b.state) ?? current.state,
      pincode: str(b.pincode) ?? current.pincode,
      mobile: str(b.mobile) ?? current.mobile,
      email: str(b.email) ?? current.email,
      gstin: str(b.gstin) ?? current.gstin,
      pan: str(b.pan) ?? current.pan,
      bankName: str(b.bankName) ?? current.bankName,
      bankAccount: str(b.bankAccount) ?? current.bankAccount,
      bankIfsc: str(b.bankIfsc) ?? current.bankIfsc,
      website: str(b.website) ?? current.website,
    };
    setSetting('company', next);
    audit(req, 'settings.company', 'settings', 'company', null);
    res.json({ company: next });
  })
);

router.put(
  '/defaults',
  wrap((req, res) => {
    if (!wf.can(req.user, 'settings.write')) throw http(403, 'Only an administrator can change defaults.');
    const b = req.body || {};
    const current = getSetting('defaults') || {};
    const next = {
      ...current,
      gstRate: b.gstRate !== undefined ? num(b.gstRate, 18) : current.gstRate,
      marginPercent: b.marginPercent !== undefined ? num(b.marginPercent, 20) : current.marginPercent,
      wastagePercent: b.wastagePercent !== undefined ? num(b.wastagePercent, 5) : current.wastagePercent,
      productionDays: b.productionDays !== undefined ? num(b.productionDays, 10) : current.productionDays,
      quotationValidityDays: b.quotationValidityDays !== undefined ? num(b.quotationValidityDays, 15) : current.quotationValidityDays,
      paymentTerms: b.paymentTerms !== undefined ? str(b.paymentTerms) : current.paymentTerms,
      quotationTerms: b.quotationTerms !== undefined ? str(b.quotationTerms) : current.quotationTerms,
      warranty: b.warranty !== undefined ? str(b.warranty) : current.warranty,
      advancePercent: b.advancePercent !== undefined ? num(b.advancePercent, 50) : current.advancePercent,
    };
    setSetting('defaults', next);
    audit(req, 'settings.defaults', 'settings', 'defaults', null);
    res.json({ defaults: next });
  })
);

module.exports = router;
