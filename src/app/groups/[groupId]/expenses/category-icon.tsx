import { Category } from '@prisma/client'
import {
  Armchair,
  Baby,
  Backpack,
  Banknote,
  Bed,
  Bike,
  BriefcaseBusiness,
  Building2,
  Bus,
  Cable,
  Car,
  CarTaxiFront,
  Cat,
  Clapperboard,
  CupSoda,
  Dices,
  Dumbbell,
  Eraser,
  FerrisWheel,
  Fuel,
  Gift,
  HandHelping,
  Home,
  Hotel,
  Lamp,
  Landmark,
  Laptop,
  LibraryBig,
  LucideIcon,
  LucideProps,
  Map,
  Martini,
  Music,
  Package,
  Palette,
  ParkingMeter,
  PartyPopper,
  Phone,
  PiggyBank,
  Plane,
  Plug,
  PlugZap,
  Receipt,
  Server,
  ShieldCheck,
  Ship,
  Shirt,
  ShoppingCart,
  Stethoscope,
  ThermometerSun,
  Ticket,
  Train,
  Trash,
  Utensils,
  Wine,
  Wrench,
} from 'lucide-react'

export function CategoryIcon({
  category,
  ...props
}: { category: Category | null } & LucideProps) {
  const Icon = getCategoryIcon(`${category?.grouping}/${category?.name}`)
  // eslint-disable-next-line react-hooks/static-components
  return <Icon {...props} />
}

function getCategoryIcon(category: string): LucideIcon {
  switch (category) {
    case 'Uncategorized/General':
      return Banknote
    case 'Uncategorized/Payment':
      return Banknote
    case 'Entertainment/Entertainment':
      return FerrisWheel
    case 'Entertainment/Games':
      return Dices
    case 'Entertainment/Movies':
      return Clapperboard
    case 'Entertainment/Music':
      return Music
    case 'Entertainment/Sports':
      return Dumbbell
    case 'Food and Drink/Food and Drink':
      return Utensils
    case 'Food and Drink/Dining Out':
      return Martini
    case 'Food and Drink/Groceries':
      return ShoppingCart
    case 'Food and Drink/Liquor':
      return Wine
    case 'Home/Home':
      return Home
    case 'Home/Electronics':
      return Plug
    case 'Home/Furniture':
      return Armchair
    case 'Home/Household Supplies':
      return Lamp
    case 'Home/Maintenance':
      return Wrench
    case 'Home/Mortgage':
      return Landmark
    case 'Home/Pets':
      return Cat
    case 'Home/Rent':
      return PiggyBank
    case 'Home/Services':
      return Wrench
    case 'Life/Childcare':
      return Baby
    case 'Life/Clothing':
      return Shirt
    case 'Life/Donation':
      return HandHelping
    case 'Life/Education':
      return LibraryBig
    case 'Life/Gifts':
      return Gift
    case 'Life/Insurance':
      return Landmark
    case 'Life/Medical Expenses':
      return Stethoscope
    case 'Life/Taxes':
      return Banknote
    case 'Transportation/Transportation':
      return Bus
    case 'Transportation/Bicycle':
      return Bike
    case 'Transportation/Bus/Train':
      return Train
    case 'Transportation/Car':
      return Car
    case 'Transportation/Gas/Fuel':
      return Fuel
    case 'Transportation/Hotel':
      return Hotel
    case 'Transportation/Parking':
      return ParkingMeter
    case 'Transportation/Plane':
      return Plane
    case 'Transportation/Taxi':
      return CarTaxiFront
    case 'Travel/Accommodation':
      return Bed
    case 'Travel/Package Tour':
      return Map
    case 'Travel/Deposit':
      return Receipt
    case 'Travel/Activities':
      return PartyPopper
    case 'Travel/Tickets':
      return Ticket
    case 'Travel/Gear Rental':
      return Backpack
    case 'Travel/Fees & Permits':
      return Landmark
    case 'Travel/Luggage':
      return Package
    case 'Travel/Travel Insurance':
      return ShieldCheck
    case 'Travel/Ferry/Boat':
      return Ship
    case 'Event/Venue':
      return Building2
    case 'Event/Decoration':
      return Palette
    case 'Event/Tickets':
      return Ticket
    case 'Event/Equipment':
      return Cable
    case 'Work/Software':
      return Laptop
    case 'Work/Hardware':
      return Plug
    case 'Work/Hosting':
      return Server
    case 'Work/Office Supplies':
      return BriefcaseBusiness
    case 'Work/Contractors':
      return HandHelping
    case 'Utilities/Utilities':
      return Banknote
    case 'Utilities/Cleaning':
      return Eraser
    case 'Utilities/Electricity':
      return PlugZap
    case 'Utilities/Heat/Gas':
      return ThermometerSun
    case 'Utilities/Trash':
      return Trash
    case 'Utilities/TV/Phone/Internet':
      return Phone
    case 'Utilities/Water':
      return CupSoda
    default:
      return Banknote
  }
}
