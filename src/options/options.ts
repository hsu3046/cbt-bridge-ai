// ============================================================
// CBT Bridge AI — Options Script
// ============================================================

async function initOptions(): Promise<void> {
  const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })

  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement
  if (settings?.apiKey) {
    apiKeyInput.value = settings.apiKey
  }

  document.getElementById('btn-save')?.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim()
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: { apiKey },
    })

    const savedMsg = document.getElementById('saved-msg')!
    savedMsg.classList.add('show')
    setTimeout(() => savedMsg.classList.remove('show'), 2000)
  })
}

initOptions()
