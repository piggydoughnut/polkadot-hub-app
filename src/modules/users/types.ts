export interface User {
  id: string
  roles: string[]
  fullName: string
  birthday: string | null
  email: string
  stealthMode: boolean
  avatar: string | null
  team: string | null
  jobTitle: string | null
  country: string | null
  city: string | null
  contacts: Record<string, string>
  authIds: AuthIds
  externalIds: {
    matrixRoomId: string | null
  }
  bio: string | null
  isInitialised: boolean
  geodata: GeoData | null
  defaultLocation: string | null
  scheduledToDelete: Date | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export enum AuthProvider {
  Polkadot = 'polkadot',
}

export enum AuthExtension {
  PolkadotJs = 'polkadot-js',
  Talisman = 'talisman',
  Nova = 'novawallet',
  Subwallet = 'subwallet',
  SubwalletJs = 'subwallet-js',
  WalletConnect = 'walletConnect',
}

export type AuthIds = Record<
  AuthProvider,
  Record<AuthExtension, Array<AuthAddressPair>>
>

export type AuthAccount = {
  address: string
  name: string
  extensionName: AuthExtension
}

export type AuthAddressPair = { name: string; address: string }

export interface Session {
  token: string
  userId: string
  createdAt: Date
}

export type OnboardingProfileRequest = {
  team: string | null
  jobTitle: string | null
  country: string | null
  city: string | null
  contacts: Record<string, string>
  tagIds: string[]
  roles: string[]
}

export type ProfileRequest = {
  fullName: string
  birthday: string | null
  team: string
  jobTitle: string
  country: string
  city: string
  bio: string
  geodata?: GeoData
  defaultLocation: string | null
  contacts: Record<string, string> | null
  roles: string[]
}

export type ProfileFormData = Omit<ProfileRequest, 'country'> & {
  country: string | null
  contacts: Record<string, string> | null
}

// FIXME: delete
export type UserMe = User & {
  countryName: string | null
}

export type UserCompact = Pick<
  User,
  'id' | 'fullName' | 'email' | 'avatar' | 'isInitialised' | 'roles'
>

export type PublicUserProfile = Pick<
  User,
  | 'id'
  | 'fullName'
  | 'birthday'
  | 'email'
  | 'avatar'
  | 'team'
  | 'jobTitle'
  | 'country'
  | 'city'
  | 'contacts'
  | 'bio'
  | 'geodata'
  | 'defaultLocation'
  | 'roles'
> & {
  countryName: string | null
  tags: Tag[]
  countryCode: string
}

export type GeoData = {
  doNotShareLocation: boolean | undefined
  coordinates?: [number, number] | undefined
  timezone?: string | undefined
  gmtOffset?: string | undefined
}

export type UserMapPin = Pick<
  PublicUserProfile,
  | 'id'
  | 'fullName'
  | 'avatar'
  | 'team'
  | 'jobTitle'
  | 'country'
  | 'city'
  | 'geodata'
>

export interface City {
  id: string
  name: string
  asciiName: string
  altNames: string[]
  countryCode: string
  timezone: string
  coordinates: [number, number]
}
export type CityPublic = Pick<City, 'id' | 'name' | 'coordinates' | 'timezone'>
export type CountryQueryResponse = {
  list: Country[]
  coordinates: CountryCoordinates[]
}
export type Country = {
  code: string
  name: string
  emoji: string
}
export type CountryCoordinates = {
  code: string
  coordinates: [number, number]
}

export interface Tag {
  id: string
  name: string
  altNames: string[]
  category: string
  order: number
  createdAt: Date
  updatedAt: Date
}

export interface UserTag {
  id: string
  userId: string
  tagId: string
  createdAt: Date
  updatedAt: Date
}

export type UserTagsRequest = Array<Tag['id']>

export type TagGroup = {
  category: string
  tags: Tag[]
}

export type ImportedTag = Pick<Tag, 'name' | 'altNames'> & { id?: string }
export type ImportedTagGroup = {
  category: string
  tags: ImportedTag[]
}

export type UserStats = {
  userCount: string
  countryCount: string
}

export type ProfileField = {
  label: string
  required: boolean
  placeholder?: string
  prefix?: string
  requiredForRoles: string[]
}

export type ProfileFieldsMetadata = {
  [key: string]: ProfileField
} & ProfileMetadata

export type ProfileMetadata = {
  birthday: ProfileField
  team: ProfileField
  jobTitle: ProfileField
  bio: ProfileField
  contacts: Record<string, ProfileField>
}

export type UsersAdminDashboardStats = {
  registeredTotal: number
  registeredToday: number
  roles: { id: string; name: string }[] | null
  registeredByDate: Array<
    {
      date: string
      total: number
    } & { [key: string]: number }
  >
}
