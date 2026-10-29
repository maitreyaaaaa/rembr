import { useEffect, useId, useMemo, useState } from 'react';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as english from '@zxcvbn-ts/language-en';

const estimator = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, ...english.dictionary },
  graphs: common.adjacencyGraphs,
  translations: english.translations,
});

const strengthLabels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];

export function PasswordStrengthField({
  id,
  value,
  onValueChange,
  disabled = false,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const generatedId = useId();
  const [revealed, setRevealed] = useState(false);
  const [announcedStatus, setAnnouncedStatus] = useState('');
  const policyId = `${generatedId}-policy`;
  const feedbackId = `${generatedId}-feedback`;
  const statusId = `${generatedId}-status`;
  const normalizedValue = value.normalize('NFC');
  const characterCount = [...normalizedValue].length;
  const estimate = useMemo(() => value ? estimator.check(normalizedValue) : null, [value, normalizedValue]);
  const score = estimate?.score ?? 0;
  const label = value ? strengthLabels[score] ?? 'Very weak' : 'Enter a password';
  const warningKey = estimate?.feedback.warning;
  const warning = warningKey
    ? english.translations.warnings[warningKey as keyof typeof english.translations.warnings]
    : '';
  const guidance = warning || (score < 3 && value ? 'Try a longer, less predictable passphrase.' : '');
  const requirementMet = characterCount >= 15;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAnnouncedStatus(value
        ? `Password strength: ${label}. ${requirementMet ? 'Minimum length met.' : `${15 - characterCount} more characters needed.`}`
        : 'Enter a password. Use at least 15 characters.');
    }, 450);
    return () => window.clearTimeout(timer);
  }, [value, label, requirementMet, characterCount]);

  return <div className="password-strength-field">
    <label htmlFor={id}>Password</label>
    <div className="password-input-wrap">
      <input
        id={id}
        name="password"
        type={revealed ? 'text' : 'password'}
        autoComplete="new-password"
        required
        maxLength={256}
        value={value}
        disabled={disabled}
        aria-invalid={value.length > 0 && !requirementMet}
        aria-describedby={`${policyId} ${feedbackId} ${statusId}`}
        onChange={(event) => {
          const next = event.target.value;
          if ([...next.normalize('NFC')].length <= 128) onValueChange(next);
        }}
      />
      <button
        type="button"
        className="password-reveal"
        aria-label={revealed ? 'Hide password' : 'Show password'}
        aria-controls={id}
        aria-pressed={revealed}
        disabled={disabled}
        onClick={() => setRevealed((current) => !current)}
      >{revealed ? 'Hide' : 'Show'}</button>
    </div>
    <div className="password-strength-line">
      <div
        className={`password-meter level-${score}`}
        data-score={score}
        data-has-value={Boolean(value)}
        role="meter"
        aria-label="Estimated password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score}
        aria-valuetext={value ? `${label} password` : 'No password entered'}
      >
        {strengthLabels.slice(1).map((_, index) => <span key={index} className={index < score ? 'filled' : ''} />)}
      </div>
      <span className={`password-strength-label level-${score}`}>{label}</span>
    </div>
    <p className={`password-policy ${requirementMet ? 'met' : ''}`} id={policyId}>
      {requirementMet ? 'Minimum length met' : `Too short · ${15 - characterCount} more ${15 - characterCount === 1 ? 'character' : 'characters'}`}
    </p>
    <p className="password-feedback" id={feedbackId}>{guidance || 'Strength is estimated on this device; it does not guarantee account security.'}</p>
    <span className="visually-hidden" id={statusId} role="status" aria-live="polite" aria-atomic="true">{announcedStatus}</span>
  </div>;
}
