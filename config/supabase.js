const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * Upload an image or PDF buffer to Supabase Storage.
 */
async function uploadFileToStorage(fileBuffer, fileName, folder = 'images', contentType = 'image/jpeg') {
    try {
        const filePath = `${folder}/${Date.now()}_${fileName}`;

        const { data, error } = await supabase.storage
            .from('images')
            .upload(filePath, fileBuffer, {
                contentType: contentType,
                upsert: false
            });

        if (error) {
            console.error('Supabase storage error:', error);
            // Return error object instead of null to identify MIME type issues
            return { error: error.message || 'Storage error', status: error.status };
        }

        const { data: urlData } = supabase.storage
            .from('images')
            .getPublicUrl(filePath);

        return { url: urlData.publicUrl };
    } catch (error) {
        console.error('Error uploading to storage:', error);
        return { error: error.message || 'Unknown upload error' };
    }
}

/**
 * Upload an image buffer to Supabase Storage. (Deprecated: Use uploadFileToStorage)
 */
async function uploadImageToStorage(imageBuffer, fileName, folder = 'images') {
    const result = await uploadFileToStorage(imageBuffer, fileName, folder, 'image/jpeg');
    return result.url || null;
}

/**
 * Delete an image from Supabase Storage by its public URL.
 */
async function deleteImageFromStorage(imageUrl) {
    try {
        if (!imageUrl) return true;

        const urlParts = imageUrl.split('/storage/v1/object/public/images/');
        if (urlParts.length < 2) return true;

        const filePath = urlParts[1];

        const { error } = await supabase.storage
            .from('images')
            .remove([filePath]);

        if (error) {
            console.error('Error deleting from storage:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error in deleteImageFromStorage:', error);
        return false;
    }
}

module.exports = {
    supabase,
    uploadFileToStorage,
    uploadImageToStorage,
    deleteImageFromStorage
};
