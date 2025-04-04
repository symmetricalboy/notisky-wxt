# Notisky Web Extension

A Web Extension that enhances Bluesky with notification features, built with WXT.

## Features

- **Real-time notifications**: Receive instant notifications for your Bluesky activity
- **Multi-account support**: Connect to multiple Bluesky accounts via the Notisky Auth Server
- **Background monitoring**: Stay updated even when you're not browsing Bluesky
- **Custom notification types**: Configure which types of interactions you want to be notified about

## Development

### Prerequisites

- Node.js 16+ and npm

### Installation

1. Clone the repository
2. Install dependencies:

```bash
cd notisky-wxt
npm install
```

3. Start the development server:

```bash
npm run dev
```

For specific browsers:

```bash
npm run dev:firefox
npm run dev:safari
```

### Building for Production

Build the extension:

```bash
npm run build
```

For specific browsers:

```bash
npm run build:firefox
npm run build:safari
```

Create distributable zip files:

```bash
npm run zip
npm run zip:firefox
npm run zip:safari
```

## Configuration

The extension works best when paired with the [Notisky Auth Server](https://github.com/yourusername/notisky-auth-server), which enables multi-account support and real-time notifications.

## License

MIT License 