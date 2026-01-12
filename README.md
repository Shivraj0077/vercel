# Vercel Auto-Deploy Project

> Intelligent deployment system that automatically detects and optimizes static and dynamic routes

A Next.js application deployed on Vercel that intelligently handles both static and dynamic content. The platform automatically detects which pages should be statically generated and which need server-side rendering, optimizing each route for maximum performance.

<div align="center">

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

**[Features](#features) • [How It Works](#how-it-works) • [Project Structure](#project-structure) • [Deployment](#deployment)**

</div>

---

## What Is This?

This project demonstrates Vercel's intelligent build system that analyzes your Next.js application and automatically determines the optimal rendering strategy for each page. No manual configuration needed—Vercel figures it out.

### The Magic

When you deploy to Vercel, it scans your pages and:
- **Detects static pages** → Pre-renders at build time, serves from CDN
- **Detects dynamic pages** → Runs as serverless functions on-demand
- **Identifies API routes** → Converts to serverless endpoints
- **Optimizes assets** → Compresses images, code-splits automatically

**Result**: You write code naturally, Vercel handles the optimization.

---

## Features

### Automatic Static Detection

Pages without server-side data fetching are automatically static:
- Portfolio pages with fixed content
- About/Contact pages
- Documentation pages
- Blog posts (when pre-generated)

**What happens**: Built once, cached globally, served in milliseconds from the nearest edge location.

### Automatic Dynamic Detection

Pages with server-side logic become serverless functions:
- User dashboards with personalized data
- Real-time feeds
- Pages using `cookies()` or `headers()`
- API routes with database queries

**What happens**: Function runs on-demand, returns fresh data, scales automatically.

### Hybrid Rendering (ISR)

Some pages get the best of both worlds:
- E-commerce product pages
- Blog with frequent updates
- Content that changes occasionally

**What happens**: Served from cache, regenerated in background when stale. Fast like static, fresh like dynamic.

### Smart Image Optimization

All images get optimized automatically:
- WebP conversion for modern browsers
- Responsive sizes generated on-the-fly
- Lazy loading by default
- Blur placeholders for smooth loading

### Edge Functions

Middleware runs globally at the edge:
- Authentication checks before page loads
- Geo-based redirects
- A/B testing logic
- Bot protection

---

## How It Works

### Build Process

1. **Code Analysis**: Vercel reads your Next.js app and identifies rendering patterns
2. **Route Classification**: Each page tagged as static, dynamic, or hybrid
3. **Optimization**: Static pages pre-built, dynamic pages become functions
4. **Deployment**: Assets to CDN, functions to serverless infrastructure
5. **Edge Distribution**: Everything distributed globally

### Static Page Detection

Vercel treats these as static:
- Pages without `getServerSideProps`
- No usage of `cookies()`, `headers()`, `searchParams`
- No dynamic API calls during render
- Can use `generateStaticParams` for dynamic routes

### Dynamic Page Detection

Vercel makes these serverless functions:
- Uses `cookies()` or `headers()` from Next.js
- Calls external APIs during render
- Queries databases directly in components
- Has `dynamic = 'force-dynamic'` config

### The Intelligence

You don't mark pages as static or dynamic. Vercel's build system:
- Analyzes imports and function calls
- Detects runtime dependencies
- Determines optimal rendering strategy
- Configures infrastructure accordingly

### Example Files

**Static Page** (`app/about/page.tsx`)
- Plain React component
- No server-side data fetching
- Automatically pre-rendered

**Dynamic Page** (`app/dashboard/page.tsx`)
- Uses `cookies()` to read session
- Personalized per user
- Becomes serverless function

**ISR Page** (`app/blog/[slug]/page.tsx`)
- Uses `generateStaticParams`
- Revalidates every 60 seconds
- Cached but fresh

**API Route** (`app/api/users/route.ts`)
- Standard Next.js API route
- Deployed as serverless function
- Auto-scales with traffic

---

## Deployment

### One-Click Deploy

The fastest way to deploy:

https://your-project.domain.com

Click, select repository, done. Vercel handles everything.

### Manual Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

### GitHub Integration (Recommended)

1. Push code to GitHub
2. Connect repository to Vercel
3. Every push triggers deployment
4. Pull requests get preview URLs
5. Main branch deploys to production

**Preview Deployments**: Each PR gets a unique URL to test changes before merging.

---

## Configuration

### Environment Variables

Set in Vercel Dashboard under Settings → Environment Variables:
```
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=your-secret
API_KEY=your-key
```

Variables automatically available in your code. Different values for production, preview, and development.

### Build Settings

Vercel auto-detects Next.js, but you can customize:

```json
// vercel.json (optional)
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["iad1", "sfo1"]
}
```

### Next.js Config

Control rendering behavior per page:

```javascript
// app/dashboard/page.tsx
export const dynamic = 'force-dynamic'; // Always dynamic
export const revalidate = 60;          // ISR with 60s cache
```

---

## Performance Insights

### Static Pages
- **Build time**: 2-5 seconds per page
- **Load time**: < 100ms globally
- **Cost**: Free (served from CDN)

### Dynamic Pages
- **Cold start**: < 300ms
- **Warm execution**: < 50ms
- **Scaling**: Automatic (0 to 1000+ req/s)

### ISR Pages
- **First load**: < 100ms (from cache)
- **Revalidation**: Background, no user impact
- **Cache hit rate**: 95%+

---

## Monitoring

Vercel provides built-in analytics:

**Performance Metrics**
- Real User Monitoring (RUM)
- Core Web Vitals tracking
- Global performance by region

**Function Logs**
- Real-time serverless function logs
- Error tracking with stack traces
- Performance profiling

**Deployment History**
- Every deployment versioned
- Instant rollback to previous versions
- Compare deployments side-by-side

Access analytics at `vercel.com/[username]/[project]/analytics`

---

## Development Workflow

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run start
```

### Local Testing

Development server simulates Vercel's behavior:
- Static pages pre-rendered on first request
- Dynamic pages run as functions
- Hot reload for instant feedback

### Type Checking

```bash
# Run TypeScript checks
npm run type-check

# Lint code
npm run lint
```

---

## Common Patterns

### Making a Page Static
Remove server-side dependencies:
```typescript
// ❌ Dynamic (uses cookies)
import { cookies } from 'next/headers';
export default function Page() {
  const session = cookies().get('session');
  return <div>{session}</div>;
}

// ✅ Static (no server dependencies)
export default function Page() {
  return <div>Welcome</div>;
}
```

### Making a Page Dynamic
Add server-side logic:
```typescript
// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default async function Page() {
  const data = await fetch('https://api.example.com/data', {
    cache: 'no-store'
  });
  return <div>{data}</div>;
}
```

### Hybrid with ISR
Best of both worlds:
```typescript
// Regenerate every hour
export const revalidate = 3600;

export default async function Page() {
  const posts = await getPosts();
  return <PostList posts={posts} />;
}
```

---

## Troubleshooting

**Page is dynamic but should be static**
- Check for `cookies()`, `headers()`, or `searchParams` usage
- Verify no dynamic API calls during render
- Look for `dynamic = 'force-dynamic'` config

**Images not optimizing**
- Use Next.js `<Image>` component
- Ensure images in `public/` or external URLs
- Check `next.config.js` image domains

**Build failing**
- Check build logs in Vercel dashboard
- Verify all environment variables set
- Test `npm run build` locally first

**Function timeout**
- Default limit is 10s (60s on Pro)
- Optimize database queries
- Use caching for expensive operations

---

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Deployment**: Vercel
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Database**: Vercel Postgres (optional)
- **Cache**: Vercel KV (optional)

---

## Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Rendering Docs](https://nextjs.org/docs/app/building-your-application/rendering)
- [Deployment Best Practices](https://vercel.com/docs/concepts/deployments/overview)

---

## License

MIT License - see [LICENSE](LICENSE) for details

---

<div align="center">

**Deploy your Next.js app in seconds**

</div>
