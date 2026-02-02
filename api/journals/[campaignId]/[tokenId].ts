import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put, list } from '@vercel/blob';

/**
 * Serverless function for token-specific journals
 * 
 * GET - Load journals for a specific token
 * PUT - Save/update journals for a specific token
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
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

  const { campaignId, tokenId } = req.query;

  if (!campaignId || Array.isArray(campaignId) || !tokenId || Array.isArray(tokenId)) {
    return res.status(400).json({ error: 'Invalid campaignId or tokenId' });
  }

  const blobPath = `journals/${campaignId}/${tokenId}.json`;

  try {
    if (req.method === 'GET') {
      try {
        const { blobs } = await list({ prefix: blobPath, limit: 1 });
        
        if (blobs.length === 0) {
          return res.status(200).json({ folders: [], notes: [] });
        }

        const response = await fetch(blobs[0].downloadUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch blob: ${response.statusText}`);
        }

        const data = await response.json();
        return res.status(200).json(data);
      } catch (error) {
        console.error('Error loading token journals:', error);
        return res.status(200).json({ folders: [], notes: [] });
      }
    }

    if (req.method === 'PUT') {
      const journalData = req.body;

      if (!journalData || typeof journalData !== 'object') {
        return res.status(400).json({ error: 'Invalid journal data' });
      }

      if (!Array.isArray(journalData.folders) || !Array.isArray(journalData.notes)) {
        return res.status(400).json({ error: 'Journal data must contain folders and notes arrays' });
      }

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
    console.error('Error in token journals API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
