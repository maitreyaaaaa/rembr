import { useId, useState } from 'react';

const rules = [
  { id: 'length', label: 'At least 12 characters', test: (value: string) => [...value].length >= 12 },
  { id: 'case', label: 'Uppercase and lowercase letters', test: (value: string) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { id: 'number', label: 'At least one number', test: (value: string) => /\d/.test(value) },
  { id: 'symbol', label: 'At least one symbol', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

const strengthLabels = ['No password', 'Weak', 'Fair', 'Good', 'Strong'];

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
  const rulesId = `${generatedId}-rules`;
  const statusId = `${generatedId}-status`;
  const met = rules.map((rule) => rule.test(value));
  const count = met.filter(Boolean).length;
  const level = value.length === 0 ? 0 : value.length < 12 ? 1 : count;
  const label = value.length === 0 ? 'No password' : value.length < 12 ? 'Too short' : strengthLabels[level] ?? 'Strong';

  return <div className="password-strength-field">
    <label htmlFor={id}>Password</label>
    <div className="password-input-wrap">
      <input
        id={id}
        name="password"
        type={revealed ? 'text' : 'password'}
        autoComplete="new-password"
        required
        minLength={12}
        maxLength={128}
        value={value}
        disabled={disabled}
        aria-describedby={`${rulesId} ${statusId}`}
        onChange={(event) => onValueChange(event.target.value)}
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
      <div className={`password-meter level-${level}`} role="meter" aria-label="Password strength" aria-valuemin={0} aria-valuemax={4} aria-valuenow={level} aria-valuetext={label}>
        {rules.map((rule, index) => <span key={rule.id} className={index < level ? 'filled' : ''} />)}
      </div>
      <span className={`password-strength-label level-${level}`}>{label}</span>
    </div>
    <ul className="password-rules" id={rulesId} aria-label="Password requirements">
      {rules.map((rule, index) => <li key={rule.id} className={met[index] ? 'met' : ''}>
        <span aria-hidden="true">{met[index] ? '✓' : '○'}</span>{rule.label}
      </li>)}
    </ul>
    <span className="visually-hidden" id={statusId} role="status" aria-live="polite">
      Password strength: {label}. {count} of {rules.length} requirements met.
    </span>
  </div>;
}
