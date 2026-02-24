const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * Upload an image buffer to Supabase Storage.
 */
async function uploadImageToStorage(imageBuffer, fileName, folder = 'images') {
    try {
        const filePath = `${folder}/${Date.now()}_${fileName}`;

        const { data, error } = await supabase.storage
            .from('images')
            .upload(filePath, imageBuffer, {
                contentType: 'image/jpeg',
                upsert: false
            });

        if (error) {
            console.error('Supabase storage error:', error);
            return null;
        }

        const { data: urlData } = supabase.storage
            .from('images')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    } catch (error) {
        console.error('Error uploading to storage:', error);
        return null;
    }
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
    uploadImageToStorage,
    deleteImageFromStorage
};
