import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
  timeout: 120000  // 2 minutos — aguenta rede lenta
});

export async function uploadBuffer(buffer, pasta = 'yuyu-eventos') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: pasta,
        resource_type: 'image',
        timeout: 120000,
        transformation: [
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ]
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

export async function apagarImagem(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { timeout: 120000 });
  } catch (e) {
    console.warn('[cloudinary] Falha ao apagar', publicId, e.message);
  }
}

export default cloudinary;
