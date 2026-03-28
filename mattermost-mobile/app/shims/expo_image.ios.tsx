import React, {forwardRef} from 'react';
import {
    Image as RNImage,
    ImageBackground as RNImageBackground,
    type ImageBackgroundProps as RNImageBackgroundProps,
    type ImageProps as RNImageProps,
    type ImageResizeMode,
    type ImageSourcePropType,
} from 'react-native';

export type ImageContentFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
export type ImageSource = ImageSourcePropType | string | Record<string, unknown>;
export type ImageStyle = NonNullable<RNImageProps['style']>;
export type ImageRef = {
    height: number;
    mediaType?: string;
    width: number;
};

type CompatImageProps = Omit<RNImageProps, 'resizeMode' | 'source'> & {
    cachePolicy?: string;
    contentFit?: ImageContentFit;
    placeholder?: ImageSource;
    placeholderContentFit?: ImageContentFit;
    priority?: string;
    recyclingKey?: string;
    source?: ImageSource;
    transition?: number | Record<string, unknown>;
};

type CompatImageBackgroundProps = Omit<RNImageBackgroundProps, 'resizeMode' | 'source'> & {
    cachePolicy?: string;
    contentFit?: ImageContentFit;
    placeholder?: ImageSource;
    placeholderContentFit?: ImageContentFit;
    priority?: string;
    recyclingKey?: string;
    source?: ImageSource;
    transition?: number | Record<string, unknown>;
};

const toResizeMode = (contentFit?: ImageContentFit): ImageResizeMode => {
    switch (contentFit) {
        case 'contain':
            return 'contain';
        case 'fill':
            return 'stretch';
        case 'none':
            return 'center';
        case 'scale-down':
            return 'contain';
        case 'cover':
        default:
            return 'cover';
    }
};

const getMediaType = (uri?: string): string|undefined => {
    if (!uri) {
        return undefined;
    }

    const extension = uri.match(/\.([a-zA-Z0-9]+)(?=\?|$)/)?.[1]?.toLowerCase();
    if (!extension) {
        return undefined;
    }

    return `image/${extension}`;
};

const normalizeSource = (source?: ImageSource): ImageSourcePropType|undefined => {
    if (!source) {
        return undefined;
    }

    if (typeof source === 'number') {
        return source;
    }

    if (typeof source === 'string') {
        return undefined;
    }

    if (Array.isArray(source)) {
        return source.map((item) => normalizeSource(item)).filter(Boolean) as ImageSourcePropType;
    }

    const typedSource = source as Record<string, unknown>;
    return {
        headers: typedSource.headers as Record<string, string> | undefined,
        height: typedSource.height as number | undefined,
        scale: typedSource.scale as number | undefined,
        uri: typedSource.uri as string | undefined,
        width: typedSource.width as number | undefined,
    };
};

type CompatImageComponent = React.ForwardRefExoticComponent<CompatImageProps & React.RefAttributes<typeof RNImage>> & {
    clearDiskCache: () => Promise<boolean>;
    loadAsync: (source: ImageSource) => Promise<ImageRef>;
    prefetch: (sources: ImageSource | ImageSource[], options?: Record<string, unknown>) => Promise<boolean>;
};

const Image = forwardRef<typeof RNImage, CompatImageProps>(({contentFit, placeholder, placeholderContentFit, priority, recyclingKey, transition, source, ...props}, ref) => {
    void placeholder;
    void placeholderContentFit;
    void priority;
    void recyclingKey;
    void transition;

    return (
        <RNImage
            ref={ref}
            {...props}
            resizeMode={toResizeMode(contentFit)}
            source={normalizeSource(source)}
        />
    );
}) as CompatImageComponent;

Image.loadAsync = async (source: ImageSource) => {
    const normalizedSource = normalizeSource(source);

    if (typeof normalizedSource === 'number') {
        const resolved = RNImage.resolveAssetSource(normalizedSource);
        return {
            height: resolved.height,
            mediaType: getMediaType(resolved.uri),
            width: resolved.width,
        };
    }

    const uri = Array.isArray(normalizedSource) ? normalizedSource[0]?.uri : normalizedSource?.uri;
    if (!uri) {
        throw new Error('Unsupported image source');
    }

    return new Promise((resolve, reject) => {
        RNImage.getSize(uri, (width, height) => {
            resolve({
                height,
                mediaType: getMediaType(uri),
                width,
            });
        }, reject);
    });
};

Image.prefetch = async (sources: ImageSource | ImageSource[]) => {
    const sourceList = Array.isArray(sources) ? sources : [sources];
    const uris = sourceList.map((source) => {
        const normalizedSource = normalizeSource(source);
        if (Array.isArray(normalizedSource)) {
            return normalizedSource[0]?.uri;
        }
        if (typeof normalizedSource === 'number') {
            return RNImage.resolveAssetSource(normalizedSource).uri;
        }
        return normalizedSource?.uri;
    }).filter(Boolean) as string[];

    const results = await Promise.all(uris.map((uri) => RNImage.prefetch(uri)));
    return results.every(Boolean);
};

Image.clearDiskCache = async () => true;

// Named export required: @components/expo_image does `import { Image, ImageBackground } from 'expo-image'`.
export {Image};

export const ImageBackground = ({contentFit, placeholder, placeholderContentFit, priority, recyclingKey, transition, source, ...props}: CompatImageBackgroundProps) => {
    void placeholder;
    void placeholderContentFit;
    void priority;
    void recyclingKey;
    void transition;

    return (
        <RNImageBackground
            {...props}
            resizeMode={toResizeMode(contentFit)}
            source={normalizeSource(source)}
        />
    );
};

export default Image;