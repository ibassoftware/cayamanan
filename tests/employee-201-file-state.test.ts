import { describe, expect, it } from 'vitest';

import { employeeInitials } from '@/components/employee/employee-state';
import {
  displayOrDash,
  dropPlaceholderLine,
  formatDateRange,
  formatHours,
  formatHumanDate,
  formatYearRange,
} from '@/components/employee/employee-format';
import {
  BLANK_ADDRESS,
  formatAddressLines,
  isSameAsPresentAddress,
  parseAddress,
  resolvePermanentAddressPayload,
  serializeAddress,
} from '@/components/employee/employee-address-state';
import { contactKindLabel, groupContactsByKind } from '@/components/employee/employee-contacts-state';
import {
  requirementStatusLabel,
  requirementStatusOrder,
  sortRequirementsByStatus,
} from '@/components/employee/employee-requirements-state';
import {
  educationLevelLabel,
  sortByDateRangeRecency,
  sortEducationByRecency,
} from '@/components/employee/employee-background-state';
import {
  ATTACHMENT_ACCEPT_EXTENSIONS,
  PHOTO_ACCEPT_EXTENSIONS,
  attachmentsForRequirement,
  checkClientUpload,
  documentDownloadUrl,
  formatByteSize,
  selectPhotoDocument,
  stripBase64Prefix,
} from '@/components/employee/document-state';

// Pure UI-logic tests for the 201-file rebuild (task packet: "grouping contacts by kind,
// 'same as present' address copying, requirement status ordering, display formatting").
describe('employeeInitials', () => {
  it('uses the first letter of first and last name', () => {
    expect(employeeInitials({ firstName: 'Maria', lastName: 'Santos', employeeNo: 'QA-0001' })).toBe('MS');
  });

  it('falls back to the employee number when both names are blank', () => {
    expect(employeeInitials({ firstName: '  ', lastName: '', employeeNo: 'QA-0001' })).toBe('QA');
  });
});

describe('formatHumanDate', () => {
  it('formats an ISO date for humans', () => {
    expect(formatHumanDate('2026-01-15')).toBe('Jan 15, 2026');
  });

  it('renders the placeholder dash for null/undefined, never literal text', () => {
    expect(formatHumanDate(null)).toBe('—');
    expect(formatHumanDate(undefined)).toBe('—');
  });

  it('falls back to the raw string for a non-ISO value', () => {
    expect(formatHumanDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDateRange / formatYearRange / formatHours', () => {
  it('renders an ongoing range as "Present"', () => {
    expect(formatDateRange('2024-01-01', null)).toBe('Jan 1, 2024 – Present');
    expect(formatYearRange(2020, null)).toBe('2020 – Present');
  });

  it('renders the dash when both ends are missing', () => {
    expect(formatDateRange(null, null)).toBe('—');
    expect(formatYearRange(null, null)).toBe('—');
  });

  it('formats training hours with a unit, or the dash', () => {
    expect(formatHours('8.00')).toBe('8.00 hrs');
    expect(formatHours(null)).toBe('—');
  });
});

describe('dropPlaceholderLine', () => {
  it('drops a line that is only the placeholder dash — the joined-fields-all-empty case', () => {
    expect(dropPlaceholderLine([formatDateRange(null, null), null].filter(Boolean).join(' · '))).toBeUndefined();
    expect(dropPlaceholderLine('—')).toBeUndefined();
  });

  it('drops null, undefined and whitespace-only values', () => {
    expect(dropPlaceholderLine(null)).toBeUndefined();
    expect(dropPlaceholderLine(undefined)).toBeUndefined();
    expect(dropPlaceholderLine('   ')).toBeUndefined();
  });

  it('keeps a line where the dash is only part of a longer joined value', () => {
    expect(dropPlaceholderLine([formatDateRange(null, null), 'Resigned'].filter(Boolean).join(' · '))).toBe('— · Resigned');
  });

  it('passes through a real value untouched', () => {
    expect(dropPlaceholderLine('Jan 1, 2024 – Present')).toBe('Jan 1, 2024 – Present');
  });
});

describe('displayOrDash', () => {
  it('returns the dash for null, undefined and whitespace-only values', () => {
    expect(displayOrDash(null)).toBe('—');
    expect(displayOrDash(undefined)).toBe('—');
    expect(displayOrDash('   ')).toBe('—');
  });

  it('passes through a real value', () => {
    expect(displayOrDash('Cebu City')).toBe('Cebu City');
  });
});

describe('address state — parse/serialize round trip and "same as present"', () => {
  it('parses a blank/null value into the blank address shape', () => {
    expect(parseAddress(null)).toEqual(BLANK_ADDRESS);
    expect(parseAddress(undefined)).toEqual(BLANK_ADDRESS);
    expect(parseAddress('not-an-object')).toEqual(BLANK_ADDRESS);
  });

  it('reads known string fields defensively and ignores unknown/mistyped ones', () => {
    expect(parseAddress({ line1: '123 Main St', city: 'Cebu City', postalCode: 6000 })).toEqual({
      ...BLANK_ADDRESS,
      line1: '123 Main St',
      city: 'Cebu City',
    });
  });

  it('serializeAddress trims fields and drops blanks, returning null when nothing is left', () => {
    expect(serializeAddress({ ...BLANK_ADDRESS, line1: '  123 Main St  ', city: '' })).toEqual({ line1: '123 Main St' });
    expect(serializeAddress(BLANK_ADDRESS)).toBeNull();
  });

  it('isSameAsPresentAddress is true only for null/undefined', () => {
    expect(isSameAsPresentAddress(null)).toBe(true);
    expect(isSameAsPresentAddress(undefined)).toBe(true);
    expect(isSameAsPresentAddress({ line1: 'x' })).toBe(false);
    expect(isSameAsPresentAddress({})).toBe(false);
  });

  it('resolvePermanentAddressPayload nulls the payload when the checkbox is checked, regardless of stale fields', () => {
    expect(resolvePermanentAddressPayload(true, { ...BLANK_ADDRESS, line1: 'Stale value' })).toBeNull();
  });

  it('resolvePermanentAddressPayload serializes the entered fields when unchecked', () => {
    expect(resolvePermanentAddressPayload(false, { ...BLANK_ADDRESS, line1: '123 Provincial Rd', city: 'Davao' })).toEqual({
      line1: '123 Provincial Rd',
      city: 'Davao',
    });
  });

  it('formatAddressLines composes readable lines and skips blank ones', () => {
    expect(formatAddressLines({ line1: '123 Main St', city: 'Cebu City', province: 'Cebu', postalCode: '6000' })).toEqual([
      '123 Main St',
      'Cebu City, Cebu',
      '6000',
    ]);
    expect(formatAddressLines(null)).toEqual([]);
  });
});

describe('groupContactsByKind', () => {
  const contacts = [
    { id: '1', kind: 'DEPENDENT', name: 'Junior', isPrimary: false },
    { id: '2', kind: 'EMERGENCY', name: 'Zeke', isPrimary: false },
    { id: '3', kind: 'EMERGENCY', name: 'Anna', isPrimary: true },
    { id: '4', kind: 'BENEFICIARY', name: 'Rosa', isPrimary: false },
    { id: '5', kind: 'UNKNOWN_KIND', name: 'Ghost', isPrimary: false },
  ];

  it('buckets contacts by kind', () => {
    const groups = groupContactsByKind(contacts);
    expect(groups.EMERGENCY.map(c => c.id)).toEqual(['3', '2']);
    expect(groups.BENEFICIARY.map(c => c.id)).toEqual(['4']);
    expect(groups.DEPENDENT.map(c => c.id)).toEqual(['1']);
  });

  it('sorts primary contacts first within a bucket, then by name', () => {
    const groups = groupContactsByKind(contacts);
    expect(groups.EMERGENCY[0].name).toBe('Anna');
  });

  it('drops a row with an unrecognized kind rather than crashing', () => {
    const groups = groupContactsByKind(contacts);
    const allIds = [...groups.EMERGENCY, ...groups.BENEFICIARY, ...groups.DEPENDENT].map(c => c.id);
    expect(allIds).not.toContain('5');
  });

  it('contactKindLabel maps every known kind to a readable label', () => {
    expect(contactKindLabel('EMERGENCY')).toBe('Emergency contact');
    expect(contactKindLabel('BENEFICIARY')).toBe('Beneficiary');
    expect(contactKindLabel('DEPENDENT')).toBe('Dependent');
  });
});

describe('requirement status ordering', () => {
  it('orders PENDING before SUBMITTED before WAIVED', () => {
    expect(requirementStatusOrder('PENDING')).toBeLessThan(requirementStatusOrder('SUBMITTED'));
    expect(requirementStatusOrder('SUBMITTED')).toBeLessThan(requirementStatusOrder('WAIVED'));
  });

  it('sortRequirementsByStatus surfaces pending items first, then alphabetically within a status', () => {
    const sorted = sortRequirementsByStatus([
      { requirement: 'NBI Clearance', status: 'WAIVED' },
      { requirement: 'Barangay Clearance', status: 'PENDING' },
      { requirement: 'SSS E-1', status: 'PENDING' },
      { requirement: 'Medical Certificate', status: 'SUBMITTED' },
    ]);
    expect(sorted.map(r => r.requirement)).toEqual([
      'Barangay Clearance',
      'SSS E-1',
      'Medical Certificate',
      'NBI Clearance',
    ]);
  });

  it('requirementStatusLabel maps every known status to a readable label', () => {
    expect(requirementStatusLabel('PENDING')).toBe('Pending');
    expect(requirementStatusLabel('SUBMITTED')).toBe('Submitted');
    expect(requirementStatusLabel('WAIVED')).toBe('Waived');
  });
});

describe('background tab ordering and labels', () => {
  it('educationLevelLabel maps every known level to a readable label', () => {
    expect(educationLevelLabel('COLLEGE')).toBe('College');
    expect(educationLevelLabel('SENIOR_HIGH')).toBe('Senior high school');
  });

  it('sortEducationByRecency puts an ongoing (no endYear) record first', () => {
    const sorted = sortEducationByRecency([
      { school: 'Old School', startYear: 2005, endYear: 2009 },
      { school: 'Current School', startYear: 2024, endYear: null },
      { school: 'Recent School', startYear: 2018, endYear: 2022 },
    ]);
    expect(sorted.map(r => r.school)).toEqual(['Current School', 'Recent School', 'Old School']);
  });

  it('sortByDateRangeRecency puts an ongoing (no endDate) record first', () => {
    const sorted = sortByDateRangeRecency([
      { employer: 'Old Corp', startDate: '2015-01-01', endDate: '2018-01-01' },
      { employer: 'Current Corp', startDate: '2023-01-01', endDate: null },
      { employer: 'Mid Corp', startDate: '2019-01-01', endDate: '2022-01-01' },
    ]);
    expect(sorted.map(r => r.employer)).toEqual(['Current Corp', 'Mid Corp', 'Old Corp']);
  });
});

describe('document-state — 201-file document store (task packet: photo + requirement attachments)', () => {
  it('checkClientUpload rejects a file over the 5 MB limit, naming the limit', () => {
    const result = checkClientUpload({ name: 'photo.png', size: 6 * 1024 * 1024 }, PHOTO_ACCEPT_EXTENSIONS);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/5 MB/);
  });

  it('checkClientUpload rejects an extension outside the allowlist, naming the accepted types', () => {
    const result = checkClientUpload({ name: 'photo.svg', size: 1024 }, PHOTO_ACCEPT_EXTENSIONS);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/JPG/);
    expect(result.message).toMatch(/PNG/);
  });

  it('checkClientUpload rejects a PDF for the photo control but accepts it for attachments', () => {
    const asPhoto = checkClientUpload({ name: 'file.pdf', size: 1024 }, PHOTO_ACCEPT_EXTENSIONS);
    expect(asPhoto.ok).toBe(false);
    const asAttachment = checkClientUpload({ name: 'file.pdf', size: 1024 }, ATTACHMENT_ACCEPT_EXTENSIONS);
    expect(asAttachment.ok).toBe(true);
  });

  it('checkClientUpload accepts a well-formed file under the limit', () => {
    expect(checkClientUpload({ name: 'photo.PNG', size: 1024 }, PHOTO_ACCEPT_EXTENSIONS)).toEqual({ ok: true });
  });

  it('stripBase64Prefix removes the data-URL prefix FileReader.readAsDataURL adds', () => {
    expect(stripBase64Prefix('data:image/png;base64,QUJD')).toBe('QUJD');
  });

  it('stripBase64Prefix passes through a value with no prefix', () => {
    expect(stripBase64Prefix('QUJD')).toBe('QUJD');
  });

  it('formatByteSize renders bytes, kilobytes and megabytes for humans', () => {
    expect(formatByteSize(512)).toBe('512 B');
    expect(formatByteSize(14 * 1024)).toBe('14 KB');
    expect(formatByteSize(2.1 * 1024 * 1024)).toBe('2.1 MB');
  });

  it('selectPhotoDocument finds the one PHOTO document, or null when there is none', () => {
    const documents = [
      { kind: 'REQUIREMENT', id: 'a' },
      { kind: 'PHOTO', id: 'b' },
    ];
    expect(selectPhotoDocument(documents)?.id).toBe('b');
    expect(selectPhotoDocument([{ kind: 'REQUIREMENT', id: 'a' }])).toBeNull();
  });

  it('attachmentsForRequirement filters to one requirement and orders oldest first', () => {
    const documents = [
      { kind: 'REQUIREMENT', requirementId: 'req-1', createdAt: '2026-01-02', id: 'newer' },
      { kind: 'REQUIREMENT', requirementId: 'req-2', createdAt: '2026-01-01', id: 'other-requirement' },
      { kind: 'PHOTO', requirementId: null, createdAt: '2026-01-01', id: 'photo' },
      { kind: 'REQUIREMENT', requirementId: 'req-1', createdAt: '2026-01-01', id: 'older' },
    ];
    expect(attachmentsForRequirement(documents, 'req-1').map(d => d.id)).toEqual(['older', 'newer']);
  });

  it('documentDownloadUrl always points at the one binary-serving route', () => {
    expect(documentDownloadUrl('abc-123')).toBe('/api/files/abc-123');
  });
});
