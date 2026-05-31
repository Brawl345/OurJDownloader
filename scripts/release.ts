#!/usr/bin/env tsx

import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

interface PackageJson {
  name: string;
  version: string;
  repository?: { url?: string };
}

const CHROME_EXTENSION_ID = 'ffmbempioemgpachdlglnolmdfapkcoo';
const GECKO_ID = 'ourjdownloader@brawl345.github.com';
const CHROME_BIN =
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary';

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function repoUrl(pkg: PackageJson): string {
  let url = pkg.repository?.url;
  if (!url) fail('Repository URL not found in package.json');
  if (url.startsWith('git+')) url = url.slice(4);
  if (url.endsWith('.git')) url = url.slice(0, -4);
  return url;
}

function readReleaseNotes(version: string): string {
  if (!existsSync('CHANGES.md')) fail('CHANGES.md not found');
  const sections = readFileSync('CHANGES.md', 'utf-8').split(/^## /m);
  const match =
    sections.find((s) => s.trimStart().startsWith(`v${version}`)) ??
    sections.find((s) => s.trim().length > 0);
  if (!match) fail('No release notes found in CHANGES.md');
  // Drop the heading line, keep the bullet points.
  return match.split('\n').slice(1).join('\n').trim();
}

function buildArtifacts(pkg: PackageJson, version: string) {
  const outputDir = resolve('output');
  mkdirSync(outputDir, { recursive: true });

  console.log('📦 Building Chrome extension...');
  execSync('npm run build', { stdio: 'inherit' });

  console.log('🦊 Building Firefox extension...');
  execSync('npm run build:firefox', { stdio: 'inherit' });

  console.log('🌐 Packing Chrome CRX...');
  const pemPath = resolve('public.pem');
  if (!existsSync(pemPath)) {
    fail('public.pem not found — do not regenerate it, the extension ID would change.');
  }
  const chromeDir = resolve('.output', 'chrome-mv3');
  const packedCrx = `${chromeDir}.crx`;
  if (existsSync(packedCrx)) rmSync(packedCrx);
  execSync(
    `"${CHROME_BIN}" --pack-extension="${chromeDir}" --pack-extension-key="${pemPath}"`,
    { stdio: 'inherit' },
  );
  if (!existsSync(packedCrx)) fail('Failed to create CRX file.');
  const crxOut = join(outputDir, `${pkg.name}-${version}.crx`);
  renameSync(packedCrx, crxOut);
  console.log(`✅ ${crxOut}`);

  console.log('🦊 Packing Firefox XPI (unsigned)...');
  const firefoxDir = resolve('.output', 'firefox-mv3');
  const xpiOut = join(outputDir, `${pkg.name}-${version}.xpi`);
  if (existsSync(xpiOut)) rmSync(xpiOut);
  execSync(`zip -r -X "${xpiOut}" .`, { cwd: firefoxDir, stdio: 'inherit' });
  console.log(`✅ ${xpiOut}`);

  return { crxOut, xpiOut };
}

function writeUpdateManifests(
  pkg: PackageJson,
  version: string,
  repo: string,
) {
  console.log('📝 Writing updates.xml (Chrome)...');
  const crxUrl = `${repo}/releases/download/${version}/${pkg.name}-${version}.crx`;
  writeFileSync(
    'updates.xml',
    `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${CHROME_EXTENSION_ID}'>
    <updatecheck codebase='${crxUrl}' version='${version}' />
  </app>
</gupdate>`,
  );

  console.log('📝 Writing updates.json (Firefox)...');
  const xpiUrl = `${repo}/releases/download/${version}/${pkg.name}-${version}.xpi`;
  const repoPath = repo.replace('https://github.com/', '');
  const updates = {
    addons: {
      [GECKO_ID]: {
        updates: [
          {
            version,
            update_link: xpiUrl,
            update_info_url: `https://raw.githubusercontent.com/${repoPath}/refs/tags/${version}/CHANGES.md`,
          },
        ],
      },
    },
  };
  writeFileSync('updates.json', `${JSON.stringify(updates, null, 2)}\n`);
}

function publish(
  version: string,
  notes: string,
  crxOut: string,
  xpiOut: string,
) {
  const tagMsg = `${version}\n\n${notes}`;
  console.log('🔖 Committing, tagging and pushing...');
  execSync('git add package.json updates.json updates.xml CHANGES.md', {
    stdio: 'inherit',
  });
  execSync(`git commit -m "${version}: release"`, { stdio: 'inherit' });
  execSync(`git tag -a ${version} -F -`, { input: tagMsg, stdio: ['pipe', 'inherit', 'inherit'] });
  execSync('git push', { stdio: 'inherit' });
  execSync(`git push origin ${version}`, { stdio: 'inherit' });

  console.log('🚀 Creating GitHub release...');
  execSync(
    `gh release create ${version} "${crxOut}" "${xpiOut}" --title ${version} --notes-file -`,
    { input: notes, stdio: ['pipe', 'inherit', 'inherit'] },
  );
}

function main() {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    fail('Usage: npm run release <version>  (e.g. 1.1.0)');
  }

  const pkg: PackageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
  const repo = repoUrl(pkg);
  const notes = readReleaseNotes(version);

  console.log(`🎯 Releasing v${version}\n`);

  pkg.version = version;
  writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

  const { crxOut, xpiOut } = buildArtifacts(pkg, version);
  writeUpdateManifests(pkg, version, repo);
  publish(version, notes, crxOut, xpiOut);

  console.log(`\n🎉 Release v${version} published!`);
}

main();
