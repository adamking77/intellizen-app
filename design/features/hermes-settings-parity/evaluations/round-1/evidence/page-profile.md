# Page and content profile

## Settings

- Regions: application sidebar, Settings section navigation, section content.
- Sections: Providers, Capabilities, Context, Voice, Appearance, General.
- Primary task: review and configure runtime providers, capabilities, default context, voice, appearance, and startup behavior.
- Product-specific differences retained intentionally: IntelliZen names Hermes and ACP adapters where Hermes only describes its own providers.
- Failure/empty behavior: when Hermes is unavailable, controls state the offline condition instead of presenting a false connected state.

## Agents

- Regions: application sidebar, agent/team content, optional right agent panel.
- Primary tasks: create or edit an agent, choose Sphere or Blob identity, select a blob silhouette and identity color, configure voice/model/context, open or collapse chat.
- Agent identity source: `@outpacelabs/avatars` for spheres and `blobatar/react` for blobs, with the Blobatar motion stylesheet loaded globally.
- The same avatar component is used in cards, the editor preview, agent panel profile, chat turns, and HUD.
