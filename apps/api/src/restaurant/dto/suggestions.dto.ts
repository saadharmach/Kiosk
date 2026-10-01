import { ArrayMaxSize, IsArray, Matches } from "class-validator";

export class SetSuggestionsDto {
  /** unTill article ids, in the order they should be offered. */
  @IsArray()
  @ArrayMaxSize(12)
  @Matches(/^[0-9]{1,19}$/, { each: true, message: "each article id must be a number" })
  articleIds!: string[];
}
