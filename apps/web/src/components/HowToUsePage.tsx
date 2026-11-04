import { useState } from 'react';
import './public-guides.css';

type GuideId = 'link' | 'instagram' | 'pinterest' | 'extension';

interface GuideStep {
  title: string;
  description: string;
  image?: string;
  alt?: string;
  referenceProductUi?: boolean;
}

interface Guide {
  id: GuideId;
  label: string;
  detail: string;
  status: string;
  steps: GuideStep[];
  unavailableCopy?: string;
}

const guides: Guide[] = [
  {
    id: 'link',
    label: 'Save a link',
    detail: 'Add one public page to your library.',
    status: 'Available now',
    steps: [
      { title: 'Open Add in your library', description: 'Choose Add from the Rembr app navigation.' },
      { title: 'Paste the page address', description: 'Use the public URL of the article, product, or page you want to keep.' },
      { title: 'Save the page', description: 'Rembr adds the page to your library and starts processing its readable content.' },
      { title: 'Add your context', description: 'Open the saved item to add a note, tags, or a collection.' },
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram export',
    detail: 'Request your saved posts, then upload the export.',
    status: 'Guide ready',
    steps: [
      { image: '1000347058.jpg', alt: 'Instagram settings screen with the settings search field', title: 'Open Instagram settings', description: 'Go to Instagram settings and tap the search box at the top.' },
      { image: '1000347059.jpg', alt: 'Instagram settings search results for the information export option', title: 'Search for the export option', description: 'Search for “Export your information” and open the matching result.' },
      { image: '1000347060.jpg', alt: 'Instagram information export screen with a create export action', title: 'Create the export', description: 'Choose the option to create an export of your account information.' },
      { image: '1000347061.jpg', alt: 'Instagram export options showing an export to device choice', title: 'Choose your device', description: 'Choose the option to download the export to your device.' },
      { image: '1000347062.jpg', alt: 'Instagram information selection screen highlighting saved activity', title: 'Select saved activity', description: 'If Instagram offers a content selector, choose Saved so the archive includes your saved posts.' },
      { image: '1000347063.jpg', alt: 'Instagram export settings with saved activity and a file format choice', title: 'Check the export settings', description: 'Review the selected activity, date range, and file format. Rembr accepts the file types listed on the Add screen.' },
      { image: '1000347064.jpg', alt: 'Instagram export screen ready to start preparing the archive', title: 'Start the export', description: 'Submit the export request. Instagram will prepare the archive for download.' },
      { image: '1000347065.jpg', alt: 'Instagram account confirmation step for an information download request', title: 'Confirm with Instagram', description: 'Instagram may ask you to confirm your account on Instagram. Enter account details only on Instagram, never in Rembr.' },
      { image: 'instagram-09-processing.jpg', alt: 'Instagram screen showing an information export is being prepared', title: 'Wait while Instagram prepares it', description: 'Instagram shows when it is preparing your information. The archive may take time to become available.' },
      { image: 'instagram-10-email-progress.png', alt: 'Email update saying an Instagram data download request is in progress', title: 'Check the progress email', description: 'Instagram may email that the download request is in progress. This means the export is not ready yet.' },
      { image: 'instagram-11-email-ready.png', alt: 'Email notification that an Instagram information download is ready', title: 'Open the ready email', description: 'When Instagram says the download is ready, open the email and follow its link back to Instagram.' },
      { image: 'instagram-12-email-download-link.png', alt: 'Instagram email with a link to review the available information download', title: 'Open the export link', description: 'Use the link in the email to return to Instagram and find the available download.' },
      { image: 'instagram-13-available-download.jpg', alt: 'Instagram available downloads screen with the requested archive', title: 'Download the archive', description: 'Choose the available download and save the file somewhere easy to find.' },
      { image: 'instagram-14-zip-saved.png', alt: 'Downloaded Instagram export ZIP file saved on a device', title: 'Keep the ZIP file', description: 'Keep the downloaded ZIP archive intact. You can upload the archive directly to Rembr.' },
      { image: 'instagram-15-add-saves.png', alt: 'Rembr Add screen with the file upload option selected', title: 'Open Add in Rembr', description: 'In Rembr, open Add and choose the file upload option.' , referenceProductUi: true },
      { image: 'instagram-16-upload-files.png', alt: 'Rembr export upload screen with the file drop area and export file choices', title: 'Upload and import', description: 'Select the Instagram export and choose Upload and import. Rembr imports recognized saved Instagram posts from the files you selected.', referenceProductUi: true },
    ],
  },
  {
    id: 'pinterest',
    label: 'Pinterest export',
    detail: 'Request your Pinterest data, then upload the export.',
    status: 'Guide ready',
    steps: [
      { image: 'pinterest-01.png', alt: 'Pinterest home screen while signed in to an account', title: 'Open Pinterest', description: 'Open Pinterest while signed in to the account you want to export.' },
      { image: 'pinterest-02.png', alt: 'Pinterest navigation with the settings control', title: 'Open settings', description: 'Choose the settings control in Pinterest navigation.' },
      { image: 'pinterest-03.png', alt: 'Pinterest settings menu', title: 'Go to Settings', description: 'Open Settings from the account menu.' },
      { image: 'pinterest-04.png', alt: 'Pinterest settings page showing privacy and data options', title: 'Open Privacy and data', description: 'Find the Privacy and data section in Pinterest settings.' },
      { image: 'pinterest-05.png', alt: 'Pinterest privacy settings with a request-your-data option', title: 'Find the data request', description: 'Scroll through the privacy settings to find the option to request your data.' },
      { image: 'pinterest-06.png', alt: 'Pinterest data request page with a request action', title: 'Request your data', description: 'Submit a request for a copy of your Pinterest account data.' },
      { image: 'pinterest-07.png', alt: 'Pinterest confirmation that a data export request was received', title: 'Confirm the request', description: 'Pinterest will confirm the request and send the next steps when the export is ready.' },
      { image: 'pinterest-08.png', alt: 'Email confirmation that a Pinterest data request was received', title: 'Check your email', description: 'Pinterest may email that the request was received. The download email may arrive later.' },
      { image: 'pinterest-09.png', alt: 'Email from Pinterest with a link to access a ready data export', title: 'Open the ready email', description: 'When Pinterest says the data is ready, open the email and follow its link.' },
      { image: 'pinterest-10.png', alt: 'Secure Pinterest export page asking for the account email', title: 'Verify your account', description: 'If Pinterest asks, enter your account email on Pinterest or its linked secure download page.' },
      { image: 'pinterest-11.png', alt: 'Secure Pinterest export verification choices', title: 'Choose a verification option', description: 'Complete one of the verification options Pinterest provides, then review and accept any terms shown there.' },
      { image: 'pinterest-12.png', alt: 'Secure message displaying the Pinterest export attachment', title: 'Open the secure message', description: 'After verification, open the secure message containing the Pinterest export.' },
      { image: 'pinterest-13.png', alt: 'Pinterest export ZIP file with its download control', title: 'Download the export', description: 'Download the archive and save it somewhere easy to find.' },
      { image: 'pinterest-14.png', alt: 'Rembr Add screen with the export upload area', title: 'Upload it to Rembr', description: 'Open Add in Rembr, select the file upload option, choose the Pinterest archive, and select Upload and import.', referenceProductUi: true },
    ],
  },
  {
    id: 'extension',
    label: 'Browser extension',
    detail: 'Save pages directly from your browser.',
    status: 'Unavailable',
    steps: [],
    unavailableCopy: 'The Rembr browser extension is not available yet. You can save a public link from Add in your library.',
  },
];

function PublicHeader() {
  return <header className="rg-header">
    <a className="rg-brand" href="/" aria-label="Rembr home">rembr<span>.</span></a>
    <nav aria-label="Public navigation">
      <a href="/features">The library</a>
      <a aria-current="page" href="/how-to-use">How to use</a>
      <a href="/help">Help</a>
      <a className="rg-header-cta" href="/app" target="_blank" rel="noopener noreferrer">Open Rembr <span aria-hidden="true">↗</span></a>
    </nav>
  </header>;
}

function PublicFooter() {
  return <footer className="rg-footer">
    <a className="rg-brand" href="/" aria-label="Rembr home">rembr<span>.</span></a>
    <div><a href="/help">Help</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a></div>
    <span>Keep what catches you. Find it when it matters.</span>
  </footer>;
}

export function HowToUsePage() {
  const [selected, setSelected] = useState<GuideId | null>(null);
  const activeGuide = guides.find((guide) => guide.id === selected);

  return <div className="rg-page">
    <PublicHeader />
    <main className="rg-main" id="main-content">
      <section className="rg-intro">
        <p className="rg-kicker">HOW TO USE REMBR</p>
        <h1>Bring your saved things together.</h1>
        <p>Choose a guide to save a public link or import saved posts from a platform export. You can return to these steps whenever you need them.</p>
      </section>

      <section className="rg-guides" aria-label="Choose a guide">
        <div className="rg-guide-list" role="group" aria-label="Available guides">
          {guides.map((guide, index) => <button
            aria-pressed={selected === guide.id}
            className={`rg-guide-card${selected === guide.id ? ' is-selected' : ''}`}
            key={guide.id}
            onClick={() => setSelected(guide.id)}
            type="button"
          >
            <span className="rg-guide-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="rg-guide-copy"><strong>{guide.label}</strong><small>{guide.detail}</small></span>
            <span className="rg-guide-status">{guide.status}</span>
            <span aria-hidden="true" className="rg-guide-arrow">↗</span>
          </button>)}
        </div>

        <div className="rg-guide-detail">
          {activeGuide ? activeGuide.steps.length ? <>
            <div className="rg-detail-heading">
              <div><p className="rg-kicker">{activeGuide.status} <span aria-hidden="true">/</span> {activeGuide.steps.length} steps</p><h2>{activeGuide.label}</h2></div>
              <a className="rg-button rg-button-primary" href="/app/add" target="_blank" rel="noopener noreferrer">Open Add <span aria-hidden="true">↗</span></a>
            </div>
            <ol className="rg-step-list" aria-label={`${activeGuide.label} steps`}>
              {activeGuide.steps.map((step, index) => <li className="rg-step" key={step.title}>
                <span className="rg-step-index">{String(index + 1).padStart(2, '0')}</span>
                <div className="rg-step-content"><h3>{step.title}</h3><p>{step.description}</p></div>
                {step.image && <figure className={`rg-step-visual${step.referenceProductUi ? ' rg-step-visual-crop' : ''}`}>
                  <img alt={step.alt ?? step.title} decoding="async" loading={index < 2 ? 'eager' : 'lazy'} src={`/how-to/${step.image}`} />
                </figure>}
              </li>)}
            </ol>
            {activeGuide.id !== 'link' && <p className="rg-note">Rembr imports files you choose. It does not ask for your social account password.</p>}
            <a className="rg-text-link" href="/app/imports" target="_blank" rel="noopener noreferrer">View import history <span aria-hidden="true">→</span></a>
          </> : <div className="rg-guide-unavailable">
            <p className="rg-kicker">{activeGuide.status}</p>
            <h2>{activeGuide.label}</h2>
            <p>{activeGuide.unavailableCopy}</p>
            {activeGuide.id === 'extension' && <a className="rg-button rg-button-primary" href="/app/add" target="_blank" rel="noopener noreferrer">Save a link in Rembr <span aria-hidden="true">↗</span></a>}
          </div> : <div className="rg-guide-prompt">
            <span className="rg-prompt-mark" aria-hidden="true">↘</span>
            <h2>Choose a guide to see the steps.</h2>
            <p>The guides show what Rembr supports today and which capture options are unavailable.</p>
            <a className="rg-text-link" href="/app/imports" target="_blank" rel="noopener noreferrer">Open import history <span aria-hidden="true">→</span></a>
          </div>}
        </div>
      </section>

      <section className="rg-tour-callout">
        <div><p className="rg-kicker">YOUR LIBRARY</p><h2>Save a page or bring in an export.</h2><p>Use the Add screen to save public links and import supported platform files.</p></div>
        <a className="rg-button rg-button-secondary" href="/app/add" target="_blank" rel="noopener noreferrer">Open Add <span aria-hidden="true">↗</span></a>
      </section>
    </main>
    <PublicFooter />
  </div>;
}

