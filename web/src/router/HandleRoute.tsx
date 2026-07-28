import { useParams } from 'react-router-dom'
import ProfilePage from '@/pages/profile/page'
import NotFound from '@/pages/NotFound'

// React Router 不支持段内部分动态参数（"/@:handle" 永远匹配不上），
// 所以用单段参数接管，再在这里按首字符分发。页面组件本身不改动。
export default function HandleRoute() {
  const { handleParam } = useParams()
  if (handleParam && handleParam.startsWith('@') && handleParam.length > 1) {
    return <ProfilePage />
  }
  return <NotFound />
}
