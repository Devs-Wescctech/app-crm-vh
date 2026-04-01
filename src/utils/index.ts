


export function createPageUrl(pageName: string, params?: Record<string, string | number>) {
    const basePath = '/' + pageName;
    if (params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            searchParams.append(key, String(value));
        });
        return `${basePath}?${searchParams.toString()}`;
    }
    return basePath;
}