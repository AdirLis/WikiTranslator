document.addEventListener('DOMContentLoaded', () => {
    const langSelect = document.querySelector('select');
    const translateBtn = document.getElementById('translateBtn');
    const longestBtn = document.getElementById('longestBtn');
    const revert = document.getElementById('revert');

    chrome.storage.local.get(['savedLang'], (result) => {
        if (result.savedLang) {
            langSelect.value = result.savedLang;
        }
    });

    langSelect.addEventListener('change', () => {
        chrome.storage.local.set({ savedLang: langSelect.value });
    });

    translateBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const targetLang = langSelect.value;
        const translateUrl = `https://translate.google.com/translate?sl=auto&tl=${targetLang}&u=${encodeURIComponent(tab.url)}`;
        chrome.tabs.update(tab.id, { url: translateUrl });
    });

    longestBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const targetLang = langSelect.value;

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: findLongestAndTranslate,
            args: [targetLang] 
        });
    });
    revert.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let currentUrl = tab.url;

    if (currentUrl.includes('.translate.goog')) {
        const urlObj = new URL(currentUrl);
        let host = urlObj.hostname;
        
        host = host.replace('.translate.goog', '');
        host = host.replace(/-/g, '.').replace(/\.\./g, '-');
        
        urlObj.hostname = host;
        
        urlObj.searchParams.delete('_x_tr_sl');
        urlObj.searchParams.delete('_x_tr_tl');
        urlObj.searchParams.delete('_x_tr_hl');
        urlObj.searchParams.delete('_x_tr_pto');
        chrome.tabs.update(tab.id, { url: urlObj.href });
    }
});
});

async function findLongestAndTranslate(targetLang) {
    try {
        const url = new URL(window.location.href);
        
        if (!url.hostname.includes("wikipedia.org") || !url.pathname.includes("/wiki/")) {
            alert("Please open a Wikipedia article.");
            return;
        }

        const currentLang = url.hostname.split('.')[0];
        const pageTitle = url.pathname.split('/wiki/')[1];

        const langApi = `https://${currentLang}.wikipedia.org/w/api.php?action=query&titles=${pageTitle}&prop=langlinks&lllimit=max&format=json&origin=*`;
        const langResp = await fetch(langApi);
        const langData = await langResp.json();
        
        const pages = langData.query.pages;
        const pageId = Object.keys(pages)[0];
        const langlinks = pages[pageId].langlinks;

        if (!langlinks || langlinks.length === 0) {
            alert("This article has no other language versions.");
            return;
        }

        const pagesToCheck = langlinks.map(link => ({lang: link.lang, title: link['*']}));
        pagesToCheck.push({ lang: currentLang, title: decodeURIComponent(pageTitle) });

        const lengthPromises = pagesToCheck.map(async (page) => {
            const infoUrl = `https://${page.lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(page.title)}&prop=info&format=json&origin=*`;
            try {
                const infoResp = await fetch(infoUrl);
                const infoData = await infoResp.json();
                const pId = Object.keys(infoData.query.pages)[0];
                const length = infoData.query.pages[pId].length || 0;
                return { ...page, length };
            } catch (e) {
                return { ...page, length: 0 };
            }
        });

        const results = await Promise.all(lengthPromises);

        results.sort((a, b) => b.length - a.length);
        const longest = results[0];

        const targetUrl = `https://${longest.lang}.wikipedia.org/wiki/${encodeURIComponent(longest.title)}`;
        const translateUrl = `https://translate.google.com/translate?sl=auto&tl=${targetLang}&u=${encodeURIComponent(targetUrl)}`;
        
        window.location.href = translateUrl;
        
    } catch (err) {
        console.error("Extension Error:", err);
        alert("An error occurred while finding the longest article.");
    }
}