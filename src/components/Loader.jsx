import PinwheelIcon from './PinwheelIcon'
import { useLang } from '../context/LanguageContext'

// Loader inicial estilo HUD: anel girando + símbolo Nova notes.
export default function Loader() {
  const { t } = useLang()
  return (
    <div className="loader">
      <div className="loader-core">
        <span className="loader-ring" />
        <PinwheelIcon className="loader-logo" size={34} />
      </div>
      <div className="loader-text">{t('common.loading')}</div>
    </div>
  )
}
