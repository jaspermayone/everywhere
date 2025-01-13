import upload from '$lib/server/upload.js';
import bodyParser from 'body-parser';
import { BlueskyTarget } from '$lib/server/targets/bluesky';
import { processImage, cleanupFiles } from '$lib/utils';

const { json } = bodyParser;

export async function POST({ request, cookies }) {
	const { description } = await request.json();

	const blueskyTarget = new BlueskyTarget({
		service: 'https://bsky.social',
		identifier: process.env.BLUESKY_IDENTIFIER || '',
		password: process.env.BLUESKY_PASSWORD || ''
	});

	const filesToCleanup: string[] = [];

	// TODO: convert express calls to SvelteKit
	try {
		const { text, altTexts } = req.body;
		const files = (req as MulterRequest).files || [];

		if (!text) {
			res.status(400).json({ error: 'Text content is required' });
			return;
		}

		// Add original files to cleanup list
		files.forEach((file) => filesToCleanup.push(file.path));

		// Parse alt texts
		let parsedAltTexts: string[] = [];
		try {
			parsedAltTexts = altTexts ? JSON.parse(altTexts) : [];
		} catch (e) {
			parsedAltTexts = altTexts ? [altTexts] : [];
		}

		// Base post options
		const postOptions: any = {
			text,
			createdAt: new Date().toISOString()
		};

		// Process and upload images
		if (files.length > 0) {
			try {
				const processedFiles = await Promise.all(
					files.map(async (file, index) => {
						const processedPath = `${file.path}_processed`;
						filesToCleanup.push(processedPath);
						await processImage(file.path, processedPath, file.mimetype);
						return { path: processedPath, mimetype: file.mimetype };
					})
				);

				const blobResponses = await Promise.all(
					processedFiles.map((file) => blueskyTarget.uploadImage(file.path, file.mimetype))
				);

				postOptions.embed = {
					$type: 'app.bsky.embed.images',
					images: blobResponses.map((response, index) => ({
						image: response.data.blob,
						alt: parsedAltTexts[index] || text.substring(0, 300)
					}))
				};
			} catch (error) {
				console.error('Error processing/uploading images:', error);
				await cleanupFiles(filesToCleanup);
				res.status(500).json({ error: 'Failed to process or upload images' });
				return;
			}
		}

		// Create the post
		const response = await blueskyTarget.createPost(postOptions);

		// Clean up all files
		await cleanupFiles(filesToCleanup);

		res.status(201).json({
			message: 'Post created successfully',
			uri: response.uri,
			cid: response.cid,
			imageCount: files.length
		});
	} catch (error) {
		console.error('Error creating post:', error);
		await cleanupFiles(filesToCleanup);
		res.status(500).json({ error: 'Failed to create post' });
	}
}
