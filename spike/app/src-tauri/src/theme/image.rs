use std::fs::File;
use std::io::{BufReader, BufWriter, Cursor, Read, Write};
use std::path::{Path, PathBuf};

use image::codecs::gif::GifDecoder;
use image::codecs::webp::WebPEncoder;
use image::imageops::FilterType;
use image::{
    AnimationDecoder, DynamicImage, ExtendedColorType, GenericImageView, ImageEncoder, ImageFormat,
    ImageReader,
};
use sha2::{Digest, Sha256};

use super::error::{ThemeError, ThemeResult};
use super::model::{BACKGROUND_FILE, GIF_BACKGROUND_FILE, THUMBNAIL_FILE};

const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_PIXELS: u64 = 40_000_000;
const MAX_EDGE: u32 = 2560;
const THUMBNAIL_WIDTH: u32 = 480;
const THUMBNAIL_HEIGHT: u32 = 300;
const PRODUCTION_GIF_LIMITS: GifLimits = GifLimits {
    max_edge: 2560,
    max_frames: 300,
    max_decoded_pixels: 180_000_000,
    max_duration_ms: 60_000,
};

#[derive(Debug, Clone, Copy)]
pub(crate) struct GifLimits {
    pub max_edge: u32,
    pub max_frames: u64,
    pub max_decoded_pixels: u64,
    pub max_duration_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SupportedImage {
    Png,
    Jpeg,
    WebP,
    Gif,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InspectedImage {
    pub format: SupportedImage,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedImage {
    pub background: PathBuf,
    pub thumbnail: PathBuf,
    pub width: u32,
    pub height: u32,
    pub thumbnail_width: u32,
    pub thumbnail_height: u32,
    pub accent: String,
}

pub fn inspect_source(path: &Path) -> ThemeResult<InspectedImage> {
    let metadata = std::fs::metadata(path).map_err(|_| ThemeError::io("import"))?;
    if !metadata.is_file() {
        return Err(ThemeError::invalid("not_a_file", "请选择图片文件"));
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err(ThemeError::invalid("file_limit", "图片不能超过 20 MB"));
    }

    let expected = expected_format(path)?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(path)
        .and_then(|mut file| file.read_to_end(&mut bytes))
        .map_err(|_| ThemeError::io("import"))?;
    let guessed = image::guess_format(&bytes)
        .map_err(|_| ThemeError::invalid("decode_failed", "无法识别这张图片"))?;
    if guessed != expected.image_format() {
        return Err(ThemeError::invalid(
            "signature_mismatch",
            "图片扩展名与实际格式不一致",
        ));
    }
    if is_animated(expected, &bytes) {
        return Err(ThemeError::invalid("animated_image", "暂不支持动态图片"));
    }

    let (width, height) = dimensions_from_header(expected, &bytes)
        .or_else(|| {
            ImageReader::with_format(Cursor::new(&bytes), expected.image_format())
                .into_dimensions()
                .ok()
        })
        .ok_or_else(|| ThemeError::invalid("decode_failed", "图片已损坏或无法解码"))?;

    if width == 0 || height == 0 {
        return Err(ThemeError::invalid("invalid_dimensions", "图片尺寸无效"));
    }
    let pixels = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or_else(|| ThemeError::invalid("pixel_limit", "图片像素过大"))?;
    if pixels > MAX_PIXELS {
        return Err(ThemeError::invalid(
            "pixel_limit",
            "图片最多支持 4000 万像素",
        ));
    }

    if expected == SupportedImage::Gif {
        inspect_gif_with_limits(path, width, height, PRODUCTION_GIF_LIMITS)?;
    } else {
        image::load_from_memory_with_format(&bytes, expected.image_format())
            .map_err(|_| ThemeError::invalid("decode_failed", "图片已损坏或无法解码"))?;
    }

    Ok(InspectedImage {
        format: expected,
        width,
        height,
    })
}

pub fn normalize_image(source: &Path, output_dir: &Path) -> ThemeResult<NormalizedImage> {
    let inspected = inspect_source(source)?;
    if inspected.format == SupportedImage::Gif {
        return prepare_gif(source, output_dir, inspected);
    }
    let bytes = std::fs::read(source).map_err(|_| ThemeError::io("import"))?;
    let decoded = image::load_from_memory_with_format(&bytes, inspected.format.image_format())
        .map_err(|_| ThemeError::invalid("decode_failed", "图片已损坏或无法解码"))?;

    let normalized = resize_max_edge(decoded, MAX_EDGE);
    let thumbnail = normalized.resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, FilterType::Lanczos3);
    let accent = extract_accent(&normalized);

    std::fs::create_dir_all(output_dir).map_err(|_| ThemeError::io("save"))?;
    let background = output_dir.join(BACKGROUND_FILE);
    let thumbnail_path = output_dir.join(THUMBNAIL_FILE);
    encode_webp(&normalized, &background)?;
    encode_webp(&thumbnail, &thumbnail_path)?;

    let (width, height) = normalized.dimensions();
    let (thumbnail_width, thumbnail_height) = thumbnail.dimensions();
    Ok(NormalizedImage {
        background,
        thumbnail: thumbnail_path,
        width,
        height,
        thumbnail_width,
        thumbnail_height,
        accent,
    })
}

pub fn sha256_file(path: &Path) -> ThemeResult<String> {
    let mut file = File::open(path).map_err(|_| ThemeError::io("read"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 16 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|_| ThemeError::io("read"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn expected_format(path: &Path) -> ThemeResult<SupportedImage> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => Ok(SupportedImage::Png),
        Some("jpg" | "jpeg") => Ok(SupportedImage::Jpeg),
        Some("webp") => Ok(SupportedImage::WebP),
        Some("gif") => Ok(SupportedImage::Gif),
        _ => Err(ThemeError::invalid(
            "unsupported_format",
            "只支持 PNG、JPEG、WebP 和 GIF 图片",
        )),
    }
}

impl SupportedImage {
    fn image_format(self) -> ImageFormat {
        match self {
            Self::Png => ImageFormat::Png,
            Self::Jpeg => ImageFormat::Jpeg,
            Self::WebP => ImageFormat::WebP,
            Self::Gif => ImageFormat::Gif,
        }
    }
}

fn dimensions_from_header(format: SupportedImage, bytes: &[u8]) -> Option<(u32, u32)> {
    match format {
        SupportedImage::Png if bytes.len() >= 24 && &bytes[12..16] == b"IHDR" => Some((
            u32::from_be_bytes(bytes[16..20].try_into().ok()?),
            u32::from_be_bytes(bytes[20..24].try_into().ok()?),
        )),
        SupportedImage::WebP if bytes.len() >= 30 && &bytes[12..16] == b"VP8X" => {
            let width = 1
                + u32::from(bytes[24])
                + (u32::from(bytes[25]) << 8)
                + (u32::from(bytes[26]) << 16);
            let height = 1
                + u32::from(bytes[27])
                + (u32::from(bytes[28]) << 8)
                + (u32::from(bytes[29]) << 16);
            Some((width, height))
        }
        SupportedImage::Gif
            if bytes.len() >= 10 && (&bytes[..6] == b"GIF87a" || &bytes[..6] == b"GIF89a") =>
        {
            Some((
                u32::from(u16::from_le_bytes([bytes[6], bytes[7]])),
                u32::from(u16::from_le_bytes([bytes[8], bytes[9]])),
            ))
        }
        _ => None,
    }
}

fn is_animated(format: SupportedImage, bytes: &[u8]) -> bool {
    match format {
        SupportedImage::Png => bytes.windows(4).any(|window| window == b"acTL"),
        SupportedImage::Jpeg => false,
        SupportedImage::WebP => {
            (bytes.len() >= 21 && &bytes[12..16] == b"VP8X" && bytes[20] & 0x02 != 0)
                || bytes
                    .windows(4)
                    .any(|window| window == b"ANIM" || window == b"ANMF")
        }
        SupportedImage::Gif => false,
    }
}

pub(crate) fn inspect_gif_with_limits(
    path: &Path,
    width: u32,
    height: u32,
    limits: GifLimits,
) -> ThemeResult<DynamicImage> {
    if width > limits.max_edge || height > limits.max_edge {
        return Err(ThemeError::invalid(
            "gif_dimensions",
            "GIF 最长边不能超过 2560 像素",
        ));
    }
    let canvas_pixels = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or_else(|| ThemeError::invalid("gif_pixel_budget", "GIF 动画像素过多"))?;
    let file = File::open(path).map_err(|_| ThemeError::io("import"))?;
    let decoder = GifDecoder::new(BufReader::new(file))
        .map_err(|_| ThemeError::invalid("decode_failed", "GIF 已损坏或无法解码"))?;
    let mut count = 0u64;
    let mut decoded_pixels = 0u64;
    let mut duration_ms = 0u64;
    let mut first = None;

    for frame in decoder.into_frames() {
        let frame =
            frame.map_err(|_| ThemeError::invalid("decode_failed", "GIF 已损坏或无法解码"))?;
        count = count
            .checked_add(1)
            .ok_or_else(|| ThemeError::invalid("gif_frame_limit", "GIF 帧数过多"))?;
        if count > limits.max_frames {
            return Err(ThemeError::invalid(
                "gif_frame_limit",
                "GIF 最多支持 300 帧",
            ));
        }
        decoded_pixels = decoded_pixels
            .checked_add(canvas_pixels)
            .ok_or_else(|| ThemeError::invalid("gif_pixel_budget", "GIF 动画像素过多"))?;
        if decoded_pixels > limits.max_decoded_pixels {
            return Err(ThemeError::invalid(
                "gif_pixel_budget",
                "GIF 动画像素总量过大",
            ));
        }
        let (numerator, denominator) = frame.delay().numer_denom_ms();
        let delay_ms = u64::from(numerator).div_ceil(u64::from(denominator).max(1));
        duration_ms = duration_ms
            .checked_add(delay_ms)
            .ok_or_else(|| ThemeError::invalid("gif_duration_limit", "GIF 动画时长过长"))?;
        if duration_ms > limits.max_duration_ms {
            return Err(ThemeError::invalid(
                "gif_duration_limit",
                "GIF 单轮时长不能超过 60 秒",
            ));
        }
        if first.is_none() {
            first = Some(DynamicImage::ImageRgba8(frame.into_buffer()));
        }
    }

    first.ok_or_else(|| ThemeError::invalid("decode_failed", "GIF 不包含可用画面"))
}

fn prepare_gif(
    source: &Path,
    output_dir: &Path,
    inspected: InspectedImage,
) -> ThemeResult<NormalizedImage> {
    let first = inspect_gif_with_limits(
        source,
        inspected.width,
        inspected.height,
        PRODUCTION_GIF_LIMITS,
    )?;
    let thumbnail = first.resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, FilterType::Lanczos3);
    let accent = extract_accent(&first);

    std::fs::create_dir_all(output_dir).map_err(|_| ThemeError::io("save"))?;
    let background = output_dir.join(GIF_BACKGROUND_FILE);
    std::fs::copy(source, &background).map_err(|_| ThemeError::io("save"))?;
    File::options()
        .write(true)
        .open(&background)
        .and_then(|file| file.sync_all())
        .map_err(|_| ThemeError::io("save"))?;
    let thumbnail_path = output_dir.join(THUMBNAIL_FILE);
    encode_webp(&thumbnail, &thumbnail_path)?;

    let (thumbnail_width, thumbnail_height) = thumbnail.dimensions();
    Ok(NormalizedImage {
        background,
        thumbnail: thumbnail_path,
        width: inspected.width,
        height: inspected.height,
        thumbnail_width,
        thumbnail_height,
        accent,
    })
}

fn resize_max_edge(image: DynamicImage, max_edge: u32) -> DynamicImage {
    let (width, height) = image.dimensions();
    if width <= max_edge && height <= max_edge {
        return image;
    }
    image.resize(max_edge, max_edge, FilterType::Lanczos3)
}

fn encode_webp(image: &DynamicImage, path: &Path) -> ThemeResult<()> {
    let rgba = image.to_rgba8();
    let file = File::create(path).map_err(|_| ThemeError::io("save"))?;
    let mut writer = BufWriter::new(file);
    WebPEncoder::new_lossless(&mut writer)
        .write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            ExtendedColorType::Rgba8,
        )
        .map_err(|_| ThemeError::io("save"))?;
    writer.flush().map_err(|_| ThemeError::io("save"))?;
    Ok(())
}

fn extract_accent(image: &DynamicImage) -> String {
    let rgba = image.to_rgba8();
    let mut best = (0.0f32, [79u8, 140u8, 255u8]);
    for y in (0..rgba.height()).step_by(32) {
        for x in (0..rgba.width()).step_by(32) {
            let pixel = rgba.get_pixel(x, y).0;
            if pixel[3] < 128 {
                continue;
            }
            let rgb = [pixel[0], pixel[1], pixel[2]];
            let max = f32::from(*rgb.iter().max().unwrap()) / 255.0;
            let min = f32::from(*rgb.iter().min().unwrap()) / 255.0;
            let luminance = (0.2126 * f32::from(rgb[0])
                + 0.7152 * f32::from(rgb[1])
                + 0.0722 * f32::from(rgb[2]))
                / 255.0;
            if !(0.08..=0.92).contains(&luminance) {
                continue;
            }
            let chroma = max - min;
            let score = chroma * 2.0 + (0.5 - (luminance - 0.5).abs());
            if score > best.0 {
                best = (score, rgb);
            }
        }
    }

    let [red, green, blue] = clamp_accent(best.1);
    format!("#{red:02x}{green:02x}{blue:02x}")
}

fn clamp_accent(rgb: [u8; 3]) -> [u8; 3] {
    let mut channels = rgb.map(|channel| f32::from(channel) / 255.0);
    let luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    if luminance < 0.28 {
        let factor = (0.28 - luminance) / (1.0 - luminance).max(0.01);
        for channel in &mut channels {
            *channel += (1.0 - *channel) * factor;
        }
    } else if luminance > 0.72 {
        let factor = 0.72 / luminance;
        for channel in &mut channels {
            *channel *= factor;
        }
    }
    channels.map(|channel| (channel.clamp(0.0, 1.0) * 255.0).round() as u8)
}
