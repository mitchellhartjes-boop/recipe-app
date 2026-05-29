// Generates an importable iOS Shortcut file ("Save to Recipe Vault.shortcut") for the
// share-to-app flow. The shortcut: Get Contents of URL (POST the shared link + bearer token) ->
// Get Dictionary Value (message) -> Show Notification.
//
// The token is read from .env (SHORTCUT_TOKEN) and baked into the output file, so the OUTPUT
// (*.shortcut) is gitignored — never commit it. This script is safe to commit (no secret in it).
//
// Run: node scripts/make-shortcut.mjs   ->   writes "Save to Recipe Vault.shortcut" in the repo root.
//
// NOTE: this is an UNSIGNED shortcut (plist). iOS imports it only with
// Settings -> Shortcuts -> "Allow Untrusted Shortcuts" enabled (that toggle appears after you've
// run at least one shortcut). If the import is ever rejected, build it by hand from
// docs/ios-shortcut.md — that path always works.
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: [path.join(root, '.env')], quiet: true, override: true })

const TOKEN = process.env.SHORTCUT_TOKEN
if (!TOKEN) {
  console.error('Missing SHORTCUT_TOKEN in .env — cannot bake the token into the shortcut.')
  process.exit(1)
}
const ENDPOINT = 'https://recipe-vault-mh.netlify.app/.netlify/functions/submit'
const OFC = '￼' // object-replacement char: marks where a variable sits inside a text field

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const uuid = () => crypto.randomUUID().toUpperCase()
const A = uuid() // Get Contents of URL
const B = uuid() // Get Dictionary Value
const C = uuid() // Show Notification

// A plain-text token field (no variables).
const plainText = (s) => `
        <dict>
          <key>WFSerializationType</key><string>WFTextTokenString</string>
          <key>Value</key>
          <dict>
            <key>string</key><string>${esc(s)}</string>
            <key>attachmentsByRange</key><dict/>
          </dict>
        </dict>`

// A text field whose entire content is one variable (ActionOutput / ExtensionInput).
const varText = (attachment) => `
        <dict>
          <key>WFSerializationType</key><string>WFTextTokenString</string>
          <key>Value</key>
          <dict>
            <key>string</key><string>${OFC}</string>
            <key>attachmentsByRange</key>
            <dict>
              <key>{0, 1}</key>
              <dict>${attachment}</dict>
            </dict>
          </dict>
        </dict>`

// A whole-field variable (used for WFInput).
const varAttachment = (attachment) => `
        <dict>
          <key>WFSerializationType</key><string>WFTextTokenAttachment</string>
          <key>Value</key>
          <dict>${attachment}</dict>
        </dict>`

const extensionInput = `
                <key>Type</key><string>ExtensionInput</string>`
const actionOutput = (uuidStr, name) => `
                <key>Type</key><string>ActionOutput</string>
                <key>OutputUUID</key><string>${uuidStr}</string>
                <key>OutputName</key><string>${esc(name)}</string>`

// One WFDictionaryFieldValueItem: key (plain text) -> value (plain text or variable).
const dictItem = (key, valueXml) => `
            <dict>
              <key>WFItemType</key><integer>0</integer>
              <key>WFKey</key>${plainText(key)}
              <key>WFValue</key>${valueXml}
            </dict>`

const dictFieldValue = (itemsXml) => `
        <dict>
          <key>WFSerializationType</key><string>WFDictionaryFieldValue</string>
          <key>Value</key>
          <dict>
            <key>WFDictionaryFieldValueItems</key>
            <array>${itemsXml}</array>
          </dict>
        </dict>`

const headers = dictFieldValue(dictItem('Authorization', plainText(`Bearer ${TOKEN}`)))
const jsonBody = dictFieldValue(dictItem('url', varText(extensionInput)))

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>WFWorkflowActions</key>
  <array>
    <dict>
      <key>WFWorkflowActionIdentifier</key><string>is.workflow.actions.downloadurl</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>UUID</key><string>${A}</string>
        <key>WFURL</key><string>${esc(ENDPOINT)}</string>
        <key>WFHTTPMethod</key><string>POST</string>
        <key>ShowHeaders</key><true/>
        <key>WFHTTPHeaders</key>${headers}
        <key>WFHTTPBodyType</key><string>JSON</string>
        <key>WFJSONValues</key>${jsonBody}
      </dict>
    </dict>
    <dict>
      <key>WFWorkflowActionIdentifier</key><string>is.workflow.actions.getvalueforkey</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>UUID</key><string>${B}</string>
        <key>WFInput</key>${varAttachment(actionOutput(A, 'Contents of URL'))}
        <key>WFGetDictionaryValueType</key><string>Value</string>
        <key>WFDictionaryKey</key><string>message</string>
      </dict>
    </dict>
    <dict>
      <key>WFWorkflowActionIdentifier</key><string>is.workflow.actions.notification</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>UUID</key><string>${C}</string>
        <key>WFNotificationActionBody</key>${varText(actionOutput(B, 'Dictionary Value'))}
        <key>WFNotificationActionTitle</key>${plainText('Recipe Vault')}
      </dict>
    </dict>
  </array>
  <key>WFWorkflowClientVersion</key><string>2607.0.2.1</string>
  <key>WFWorkflowMinimumClientVersion</key><integer>900</integer>
  <key>WFWorkflowMinimumClientVersionString</key><string>900</string>
  <key>WFWorkflowHasShortcutInputVariables</key><true/>
  <key>WFWorkflowIcon</key>
  <dict>
    <key>WFWorkflowIconStartColor</key><integer>4274264319</integer>
    <key>WFWorkflowIconGlyphNumber</key><integer>59446</integer>
  </dict>
  <key>WFWorkflowImportQuestions</key><array/>
  <key>WFWorkflowTypes</key><array/>
  <key>WFQuickActionSurfaces</key><array/>
  <key>WFWorkflowInputContentItemClasses</key>
  <array>
    <string>WFURLContentItem</string>
    <string>WFStringContentItem</string>
    <string>WFSafariWebPageContentItem</string>
    <string>WFArticleContentItem</string>
  </array>
</dict>
</plist>
`

const out = path.join(root, 'Save to Recipe Vault.shortcut')
fs.writeFileSync(out, plist, 'utf8')
console.log(`Wrote ${out}`)
console.log(`Actions: Get Contents of URL (${A}) -> Get Dictionary Value (${B}) -> Show Notification (${C})`)
console.log('Transfer it to your iPhone (AirDrop / iCloud / email) and open it to import.')
console.log('Requires Settings -> Shortcuts -> "Allow Untrusted Shortcuts" (run any shortcut once to unlock it).')
