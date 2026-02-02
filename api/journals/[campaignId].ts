import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put, list } from '@vercel/blob';

/**
 * Serverless function for journals
 * 
 * GET - Load journals for a campaign
 * PUT - Save/update journals
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS - restrict to specific origins in production
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
  const origin = req.headers.origin || '';
  
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes('*') ? '*' : origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { campaignId } = req.query;

  if (!campaignId || Array.isArray(campaignId)) {
    return res.status(400).json({ error: 'Invalid campaignId' });
  }

  const blobPath = `journals/${campaignId}.json`;

  try {
    if (req.method === 'GET') {
      // Load journals using Vercel Blob SDK
      try {
        // List blobs to check if the file exists and get its URL
        const { blobs } = await list({ prefix: blobPath, limit: 1 });
        
        if (blobs.length === 0) {
          // Return empty journal data if no journals exist yet
          return res.status(200).json({ folders: [], notes: [] });
        }

        // Fetch the blob content using the download URL
        const response = await fetch(blobs[0].downloadUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch blob: ${response.statusText}`);
        }

        const data = await response.json();
        return res.status(200).json(data);
      } catch (error) {
        console.error('Error loading journals:', error);
        // Return empty journal data on error
        return res.status(200).json({ folders: [], notes: [] });
      }
    }

    if (req.method === 'PUT') {
      // Save journals
      const journalData = req.body;

      if (!journalData || typeof journalData !== 'object') {
        return res.status(400).json({ error: 'Invalid journal data' });
      }

      if (!Array.isArray(journalData.folders) || !Array.isArray(journalData.notes)) {
        return res.status(400).json({ error: 'Journal data must contain folders and notes arrays' });
      }

      // Note: Using 'public' access since Owlbear Rodeo is a collaborative platform
      // where players share game resources. Journals are campaign-specific.
      // Client-side visibility enforcement is implemented.
      const blob = await put(blobPath, JSON.stringify(journalData), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      return res.status(200).json({ 
        success: true, 
        url: blob.url,
        path: blobPath,
        folderCount: journalData.folders.length,
        noteCount: journalData.notes.length
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in journals API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
